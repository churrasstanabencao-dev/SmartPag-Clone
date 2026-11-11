ALTER TABLE public.transfers
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text;

ALTER TABLE public.transfers DROP CONSTRAINT IF EXISTS transfers_status_check;
ALTER TABLE public.transfers ADD CONSTRAINT transfers_status_check
  CHECK (status IN ('draft','sent','approved','rejected','confirmed'));

UPDATE public.transfers SET status = 'approved' WHERE status = 'confirmed';

DROP FUNCTION IF EXISTS public.confirm_transfer(uuid);

CREATE OR REPLACE FUNCTION public.send_transfer(_transfer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tr RECORD; it RECORD; src RECORD; v_tab uuid; v_reg uuid;
BEGIN
  SELECT * INTO tr FROM public.transfers WHERE id = _transfer_id;
  IF tr IS NULL THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  IF NOT public.can_manage_store(tr.from_store_id) THEN
    RAISE EXCEPTION 'Somente o gestor da loja de origem pode enviar';
  END IF;
  IF tr.status <> 'draft' THEN RAISE EXCEPTION 'Transferência já enviada'; END IF;
  IF tr.from_store_id = tr.to_store_id THEN RAISE EXCEPTION 'Origem e destino iguais'; END IF;

  FOR it IN SELECT * FROM public.transfer_items WHERE transfer_id = _transfer_id LOOP
    IF it.quantity <= 0 THEN CONTINUE; END IF;
    SELECT * INTO src FROM public.products WHERE id = it.product_id;
    IF src IS NULL THEN CONTINUE; END IF;
    UPDATE public.products SET stock_qty = coalesce(stock_qty,0) - it.quantity WHERE id = src.id;
    INSERT INTO public.stock_movements (user_id, store_id, product_id, quantity, reason)
      VALUES (tr.user_id, tr.from_store_id, src.id, -it.quantity, 'transferencia_saida');
  END LOOP;

  IF tr.total_cents > 0 THEN
    INSERT INTO public.tabs (user_id, store_id, name, kind, status, opened_at, closed_at)
    VALUES (tr.user_id, tr.from_store_id,
      'Transferência' || coalesce(' ' || tr.doc_number, ''),
      'transferencia', 'closed', now(), now())
    RETURNING id INTO v_tab;

    INSERT INTO public.tab_items (user_id, store_id, tab_id, product_id, name, quantity, unit_price_cents)
    SELECT tr.user_id, tr.from_store_id, v_tab, ti.product_id, ti.name, ti.quantity, ti.unit_price_cents
    FROM public.transfer_items ti WHERE ti.transfer_id = _transfer_id AND ti.quantity > 0;

    SELECT id INTO v_reg FROM public.cash_registers
      WHERE store_id = tr.from_store_id AND status = 'open' ORDER BY opened_at DESC LIMIT 1;

    INSERT INTO public.payments (user_id, store_id, tab_id, method, amount_cents, register_id)
    VALUES (tr.user_id, tr.from_store_id, v_tab, 'transferencia', tr.total_cents, v_reg);
  END IF;

  UPDATE public.transfers SET status = 'sent' WHERE id = _transfer_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.approve_transfer(_transfer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tr RECORD; it RECORD; src RECORD; dest_id uuid; dest_owner uuid;
  prev_qty numeric; prev_cost bigint; new_cost bigint;
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
    SELECT * INTO src FROM public.products WHERE id = it.product_id;
    IF src IS NULL THEN CONTINUE; END IF;

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
    INSERT INTO public.expenses (user_id, store_id, description, amount_cents, category, due_date, paid, transfer_id)
    VALUES (dest_owner, tr.to_store_id,
      'Compra da matriz' || coalesce(' — ' || tr.doc_number, ''),
      tr.total_cents, 'transferencia', tr.issued_at, false, tr.id);
  END IF;

  UPDATE public.transfers
    SET status = 'approved', approved_by = auth.uid(), approved_at = now()
    WHERE id = _transfer_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.reject_transfer(_transfer_id uuid, _reason text DEFAULT NULL)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  tr RECORD; it RECORD; v_tab uuid;
BEGIN
  SELECT * INTO tr FROM public.transfers WHERE id = _transfer_id;
  IF tr IS NULL THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  IF NOT public.can_manage_store(tr.to_store_id) THEN
    RAISE EXCEPTION 'Somente o gestor da loja de destino pode recusar';
  END IF;
  IF tr.status <> 'sent' THEN RAISE EXCEPTION 'Transferência não está aguardando autorização'; END IF;

  FOR it IN SELECT * FROM public.transfer_items WHERE transfer_id = _transfer_id LOOP
    IF it.quantity <= 0 THEN CONTINUE; END IF;
    UPDATE public.products SET stock_qty = coalesce(stock_qty,0) + it.quantity WHERE id = it.product_id;
    INSERT INTO public.stock_movements (user_id, store_id, product_id, quantity, reason)
      VALUES (tr.user_id, tr.from_store_id, it.product_id, it.quantity, 'transferencia_recusada');
  END LOOP;

  FOR v_tab IN
    SELECT t.id FROM public.tabs t
    WHERE t.store_id = tr.from_store_id
      AND t.kind = 'transferencia'
      AND t.name = 'Transferência' || coalesce(' ' || tr.doc_number, '')
      AND t.closed_at >= tr.created_at
    ORDER BY t.closed_at DESC LIMIT 1
  LOOP
    DELETE FROM public.payments WHERE tab_id = v_tab;
    DELETE FROM public.tab_items WHERE tab_id = v_tab;
    DELETE FROM public.tabs WHERE id = v_tab;
  END LOOP;

  UPDATE public.transfers
    SET status = 'rejected', rejected_reason = _reason, approved_by = auth.uid(), approved_at = now()
    WHERE id = _transfer_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.pay_transfer(_transfer_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE tr RECORD;
BEGIN
  SELECT * INTO tr FROM public.transfers WHERE id = _transfer_id;
  IF tr IS NULL THEN RAISE EXCEPTION 'Transferência não encontrada'; END IF;
  IF NOT (public.can_manage_store(tr.to_store_id) OR public.can_manage_store(tr.from_store_id)) THEN
    RAISE EXCEPTION 'Sem permissão';
  END IF;
  IF tr.status <> 'approved' THEN RAISE EXCEPTION 'Transferência precisa estar autorizada'; END IF;
  IF tr.payment_status = 'paid' THEN RAISE EXCEPTION 'Transferência já paga'; END IF;

  UPDATE public.expenses SET paid = true WHERE transfer_id = _transfer_id;
  UPDATE public.transfers SET payment_status = 'paid' WHERE id = _transfer_id;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.send_transfer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.approve_transfer(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reject_transfer(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pay_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.send_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_transfer(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reject_transfer(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.pay_transfer(uuid) TO authenticated;
