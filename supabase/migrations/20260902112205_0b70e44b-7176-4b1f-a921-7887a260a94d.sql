ALTER TABLE public.purchases
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_reason text,
  ADD COLUMN IF NOT EXISTS expense_id uuid REFERENCES public.expenses(id);

ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS received_quantity numeric;

CREATE OR REPLACE FUNCTION public.send_purchase(_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE p RECORD;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = _purchase_id;
  IF p IS NULL THEN RAISE EXCEPTION 'Nota não encontrada'; END IF;
  IF NOT (p.user_id = auth.uid() OR public.has_store_access(p.store_id)) THEN
    RAISE EXCEPTION 'Sem acesso';
  END IF;
  IF p.status <> 'draft' THEN RAISE EXCEPTION 'Nota não está em rascunho'; END IF;
  UPDATE public.purchases SET status = 'sent' WHERE id = _purchase_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.approve_purchase(_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  p RECORD; it RECORD; recv numeric;
  prev_qty numeric; prev_cost bigint; new_cost bigint;
  v_items bigint := 0; v_total bigint; v_exp uuid;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = _purchase_id;
  IF p IS NULL THEN RAISE EXCEPTION 'Nota não encontrada'; END IF;
  IF NOT public.can_manage_store(p.store_id) THEN
    RAISE EXCEPTION 'Somente o gestor da loja pode autorizar a nota';
  END IF;
  IF p.status <> 'sent' THEN RAISE EXCEPTION 'Nota não está aguardando conferência'; END IF;

  FOR it IN SELECT * FROM public.purchase_items WHERE purchase_id = _purchase_id LOOP
    recv := coalesce(it.received_quantity, it.quantity);
    IF recv < 0 THEN recv := 0; END IF;
    v_items := v_items + round(recv * it.unit_cost_cents);
    IF recv <= 0 OR it.product_id IS NULL THEN CONTINUE; END IF;

    SELECT stock_qty, cost_cents INTO prev_qty, prev_cost FROM public.products WHERE id = it.product_id;
    IF prev_qty IS NULL THEN CONTINUE; END IF;
    IF prev_qty < 0 THEN prev_qty := 0; END IF;
    new_cost := CASE WHEN (prev_qty + recv) > 0
      THEN round(((prev_qty * coalesce(prev_cost,0)) + (recv * it.unit_cost_cents)) / (prev_qty + recv))
      ELSE it.unit_cost_cents END;

    UPDATE public.products
      SET stock_qty = coalesce(stock_qty,0) + recv, cost_cents = new_cost
      WHERE id = it.product_id;

    INSERT INTO public.stock_movements (user_id, store_id, product_id, quantity, reason)
      VALUES (p.user_id, p.store_id, it.product_id, recv, 'compra');
  END LOOP;

  v_total := v_items + coalesce(p.freight_cents,0) - coalesce(p.discount_cents,0);
  IF v_total < 0 THEN v_total := 0; END IF;

  IF v_total > 0 THEN
    INSERT INTO public.expenses (user_id, store_id, description, amount_cents, category, due_date, paid)
    VALUES (p.user_id, p.store_id,
      'Compra ' || p.supplier || coalesce(' — NF ' || p.invoice_number, ''),
      v_total, 'compra', p.issued_at, false)
    RETURNING id INTO v_exp;
  END IF;

  UPDATE public.purchases
    SET status = 'approved', total_cents = v_total, approved_by = auth.uid(),
        approved_at = now(), expense_id = v_exp
    WHERE id = _purchase_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.reject_purchase(_purchase_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE p RECORD;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = _purchase_id;
  IF p IS NULL THEN RAISE EXCEPTION 'Nota não encontrada'; END IF;
  IF NOT public.can_manage_store(p.store_id) THEN
    RAISE EXCEPTION 'Somente o gestor da loja pode recusar a nota';
  END IF;
  IF p.status <> 'sent' THEN RAISE EXCEPTION 'Nota não está aguardando conferência'; END IF;
  UPDATE public.purchases
    SET status = 'rejected', rejected_reason = _reason, approved_by = auth.uid(), approved_at = now()
    WHERE id = _purchase_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.pay_purchase(_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE p RECORD;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = _purchase_id;
  IF p IS NULL THEN RAISE EXCEPTION 'Nota não encontrada'; END IF;
  IF NOT public.can_manage_store(p.store_id) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  IF p.status <> 'approved' THEN RAISE EXCEPTION 'Nota precisa estar autorizada'; END IF;
  IF p.expense_id IS NULL THEN RAISE EXCEPTION 'Nota sem conta a pagar'; END IF;
  UPDATE public.expenses SET paid = true WHERE id = p.expense_id;
END;
$$;
