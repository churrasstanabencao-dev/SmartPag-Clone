ALTER TABLE public.products ADD COLUMN IF NOT EXISTS wholesale_price_cents bigint NOT NULL DEFAULT 0;

CREATE TABLE public.transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  from_store_id uuid NOT NULL REFERENCES public.stores(id),
  to_store_id uuid NOT NULL REFERENCES public.stores(id),
  doc_number text,
  issued_at date NOT NULL DEFAULT current_date,
  notes text,
  total_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  payment_status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfers TO authenticated;
GRANT ALL ON public.transfers TO service_role;
ALTER TABLE public.transfers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfers_access" ON public.transfers FOR ALL TO authenticated
  USING (public.has_store_access(from_store_id) OR public.has_store_access(to_store_id))
  WITH CHECK (public.has_store_access(from_store_id) OR public.has_store_access(to_store_id));

CREATE TABLE public.transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  transfer_id uuid NOT NULL REFERENCES public.transfers(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id),
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 0,
  unit_price_cents bigint NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.transfer_items TO authenticated;
GRANT ALL ON public.transfer_items TO service_role;
ALTER TABLE public.transfer_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "transfer_items_access" ON public.transfer_items FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id
    AND (public.has_store_access(t.from_store_id) OR public.has_store_access(t.to_store_id))))
  WITH CHECK (EXISTS (SELECT 1 FROM public.transfers t WHERE t.id = transfer_id
    AND (public.has_store_access(t.from_store_id) OR public.has_store_access(t.to_store_id))));

CREATE TRIGGER transfers_updated BEFORE UPDATE ON public.transfers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS transfer_id uuid REFERENCES public.transfers(id) ON DELETE SET NULL;

CREATE OR REPLACE FUNCTION public.confirm_transfer(_transfer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  tr RECORD; it RECORD; src RECORD; dest_id uuid;
  prev_qty numeric; prev_cost bigint; new_cost bigint; dest_owner uuid;
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

    -- saída na origem
    UPDATE public.products SET stock_qty = coalesce(stock_qty,0) - it.quantity WHERE id = src.id;
    INSERT INTO public.stock_movements (user_id, store_id, product_id, quantity, reason)
      VALUES (tr.user_id, tr.from_store_id, src.id, -it.quantity, 'transferencia_saida');

    -- produto correspondente no destino
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

  -- conta a pagar na loja de destino
  IF tr.total_cents > 0 THEN
    INSERT INTO public.expenses (user_id, store_id, description, amount_cents, category, due_date, paid, transfer_id)
    VALUES (dest_owner, tr.to_store_id,
      'Compra da matriz' || coalesce(' — ' || tr.doc_number, ''),
      tr.total_cents, 'transferencia', tr.issued_at, false, tr.id);
  END IF;

  UPDATE public.transfers SET status = 'confirmed' WHERE id = _transfer_id;
END;
$function$;
