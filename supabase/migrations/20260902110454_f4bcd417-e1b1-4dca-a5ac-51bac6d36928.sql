CREATE OR REPLACE FUNCTION public.confirm_transfer(_transfer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tr RECORD; it RECORD; src RECORD; dest_id uuid;
  prev_qty numeric; prev_cost bigint; new_cost bigint; dest_owner uuid;
  v_tab uuid; v_reg uuid;
BEGIN
  SELECT * INTO tr FROM public.transfers WHERE id = _transfer_id;
  IF tr IS NULL THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  IF NOT (public.has_store_access(tr.from_store_id) OR public.has_store_access(tr.to_store_id)) THEN
    RAISE EXCEPTION 'Sem acesso';
  END IF;
  IF tr.status = 'confirmed' THEN RAISE EXCEPTION 'Transferência já confirmada'; END IF;
  IF tr.from_store_id = tr.to_store_id THEN RAISE EXCEPTION 'Origem e destino iguais'; END IF;

  SELECT owner_id INTO dest_owner FROM public.stores WHERE id = tr.to_store_id;

  FOR it IN SELECT * FROM public.transfer_items WHERE transfer_id = _transfer_id LOOP
    IF it.quantity <= 0 THEN CONTINUE; END IF;

    SELECT * INTO src FROM public.products WHERE id = it.product_id;
    IF src IS NULL THEN CONTINUE; END IF;

    UPDATE public.products SET stock_qty = coalesce(stock_qty,0) - it.quantity WHERE id = src.id;
    INSERT INTO public.stock_movements (user_id, store_id, product_id, quantity, reason)
      VALUES (tr.user_id, tr.from_store_id, src.id, -it.quantity, 'transferencia_saida');

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
    new_cost := CASE WHEN (prev_qty + it.quantity) > 0
      THEN round(((prev_qty * coalesce(prev_cost,0)) + (it.quantity * it.unit_price_cents)) / (prev_qty + it.quantity))
      ELSE it.unit_price_cents END;

    UPDATE public.products
      SET stock_qty = coalesce(stock_qty,0) + it.quantity, cost_cents = new_cost
      WHERE id = dest_id;

    INSERT INTO public.stock_movements (user_id, store_id, product_id, quantity, reason)
      VALUES (dest_owner, tr.to_store_id, dest_id, it.quantity, 'transferencia_entrada');
  END LOOP;

  IF tr.total_cents > 0 THEN
    -- venda na loja de origem (entra no total de vendas / relatórios)
    INSERT INTO public.tabs (user_id, store_id, name, kind, status, opened_at, closed_at)
    VALUES (tr.user_id, tr.from_store_id,
      'Transferência' || coalesce(' ' || tr.doc_number, ''),
      'transferencia', 'closed', now(), now())
    RETURNING id INTO v_tab;

    INSERT INTO public.tab_items (user_id, store_id, tab_id, product_id, name, quantity, unit_price_cents)
    SELECT tr.user_id, tr.from_store_id, v_tab, ti.product_id, ti.name, ti.quantity, ti.unit_price_cents
    FROM public.transfer_items ti WHERE ti.transfer_id = _transfer_id AND ti.quantity > 0;

    SELECT id INTO v_reg FROM public.cash_registers
      WHERE store_id = tr.from_store_id AND status = 'open'
      ORDER BY opened_at DESC LIMIT 1;

    INSERT INTO public.payments (user_id, store_id, tab_id, method, amount_cents, register_id)
    VALUES (tr.user_id, tr.from_store_id, v_tab, 'transferencia', tr.total_cents, v_reg);

    -- conta a pagar na loja de destino
    INSERT INTO public.expenses (user_id, store_id, description, amount_cents, category, due_date, paid, transfer_id)
    VALUES (dest_owner, tr.to_store_id,
      'Compra da matriz' || coalesce(' — ' || tr.doc_number, ''),
      tr.total_cents, 'transferencia', tr.issued_at, false, tr.id);
  END IF;

  UPDATE public.transfers SET status = 'confirmed' WHERE id = _transfer_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pay_transfer(_transfer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tr RECORD; dest_owner uuid; reg_dest uuid; reg_orig uuid; label text;
BEGIN
  SELECT * INTO tr FROM public.transfers WHERE id = _transfer_id;
  IF tr IS NULL THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  IF NOT (public.has_store_access(tr.from_store_id) OR public.has_store_access(tr.to_store_id)) THEN
    RAISE EXCEPTION 'Sem acesso';
  END IF;
  IF tr.status <> 'confirmed' THEN RAISE EXCEPTION 'Confirme a transferência antes de dar baixa'; END IF;
  IF tr.payment_status = 'paid' THEN RAISE EXCEPTION 'Transferência já paga'; END IF;

  SELECT owner_id INTO dest_owner FROM public.stores WHERE id = tr.to_store_id;
  label := 'Transferência' || coalesce(' ' || tr.doc_number, '');

  SELECT id INTO reg_dest FROM public.cash_registers
    WHERE store_id = tr.to_store_id AND status = 'open' ORDER BY opened_at DESC LIMIT 1;
  IF reg_dest IS NOT NULL THEN
    INSERT INTO public.cash_movements (user_id, store_id, register_id, kind, description, amount_cents, method)
    VALUES (dest_owner, tr.to_store_id, reg_dest, 'saida', label || ' — pagamento à matriz', tr.total_cents, 'transferencia');
  END IF;

  SELECT id INTO reg_orig FROM public.cash_registers
    WHERE store_id = tr.from_store_id AND status = 'open' ORDER BY opened_at DESC LIMIT 1;
  IF reg_orig IS NOT NULL THEN
    INSERT INTO public.cash_movements (user_id, store_id, register_id, kind, description, amount_cents, method)
    VALUES (tr.user_id, tr.from_store_id, reg_orig, 'entrada', label || ' — recebimento da loja', tr.total_cents, 'transferencia');
  END IF;

  UPDATE public.expenses SET paid = true WHERE transfer_id = _transfer_id;
  UPDATE public.transfers SET payment_status = 'paid' WHERE id = _transfer_id;
END;
$function$;
