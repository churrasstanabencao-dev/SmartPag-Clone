ALTER TABLE public.transfer_items ADD COLUMN IF NOT EXISTS received_quantity numeric;

CREATE OR REPLACE FUNCTION public.approve_transfer(_transfer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tr RECORD; it RECORD; src RECORD; dest_id uuid; dest_owner uuid;
  prev_qty numeric; prev_cost bigint; new_cost bigint;
  recv numeric; diff numeric; v_total bigint := 0;
BEGIN
  SELECT * INTO tr FROM public.transfers WHERE id = _transfer_id;
  IF tr IS NULL THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  IF NOT public.can_manage_store(tr.to_store_id) THEN
    RAISE EXCEPTION 'Somente o gestor da loja de destino pode autorizar';
  END IF;
  IF tr.status <> 'sent' THEN RAISE EXCEPTION 'Transferência não está aguardando autorização'; END IF;

  SELECT owner_id INTO dest_owner FROM public.stores WHERE id = tr.to_store_id;

  FOR it IN SELECT * FROM public.transfer_items WHERE transfer_id = _transfer_id LOOP
    IF it.quantity <= 0 THEN CONTINUE; END IF;
    recv := coalesce(it.received_quantity, it.quantity);
    IF recv < 0 THEN recv := 0; END IF;
    IF recv > it.quantity THEN recv := it.quantity; END IF;
    diff := it.quantity - recv;

    SELECT * INTO src FROM public.products WHERE id = it.product_id;

    -- devolve a diferença de conferência para a origem
    IF diff > 0 AND src IS NOT NULL THEN
      UPDATE public.products SET stock_qty = coalesce(stock_qty,0) + diff WHERE id = src.id;
      INSERT INTO public.stock_movements (user_id, store_id, product_id, quantity, reason)
        VALUES (tr.user_id, tr.from_store_id, src.id, diff, 'transferencia_divergencia');
    END IF;

    v_total := v_total + round(recv * it.unit_price_cents);
    IF recv <= 0 OR src IS NULL THEN CONTINUE; END IF;

    SELECT id INTO dest_id FROM public.products
      WHERE store_id = tr.to_store_id
        AND ((src.sku IS NOT NULL AND sku = src.sku) OR lower(name) = lower(src.name))
      LIMIT 1;

    IF dest_id IS NULL THEN
      INSERT INTO public.products (user_id, store_id, name, description, price_cents, cost_cents,
        slug, sku, active, track_stock, stock_qty, min_stock, wholesale_price_cents)
      VALUES (dest_owner, tr.to_store_id, src.name, src.description, src.price_cents, it.unit_price_cents,
        src.slug || '-' || substr(replace(tr.to_store_id::text,'-',''),1,6), src.sku, true, true, 0,
        src.min_stock, src.wholesale_price_cents)
      RETURNING id INTO dest_id;
    END IF;

    SELECT stock_qty, cost_cents INTO prev_qty, prev_cost FROM public.products WHERE id = dest_id;
    IF prev_qty IS NULL OR prev_qty < 0 THEN prev_qty := 0; END IF;
    new_cost := CASE WHEN (prev_qty + recv) > 0
      THEN round(((prev_qty * coalesce(prev_cost,0)) + (recv * it.unit_price_cents)) / (prev_qty + recv))
      ELSE it.unit_price_cents END;

    UPDATE public.products
      SET stock_qty = coalesce(stock_qty,0) + recv, cost_cents = new_cost
      WHERE id = dest_id;

    INSERT INTO public.stock_movements (user_id, store_id, product_id, quantity, reason)
      VALUES (dest_owner, tr.to_store_id, dest_id, recv, 'transferencia_entrada');
  END LOOP;

  IF v_total > 0 THEN
    INSERT INTO public.expenses (user_id, store_id, description, amount_cents, category, due_date, paid, transfer_id)
    VALUES (dest_owner, tr.to_store_id,
      'Compra da matriz' || coalesce(' — ' || tr.doc_number, ''),
      v_total, 'transferencia', tr.issued_at, false, tr.id);
  END IF;

  UPDATE public.transfers
    SET status = 'approved', approved_by = auth.uid(), approved_at = now()
    WHERE id = _transfer_id;
END;
$function$;
