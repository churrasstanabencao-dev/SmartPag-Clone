CREATE TABLE public.purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  supplier text NOT NULL DEFAULT '',
  invoice_number text,
  issued_at date NOT NULL DEFAULT CURRENT_DATE,
  notes text,
  freight_cents bigint NOT NULL DEFAULT 0,
  discount_cents bigint NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'draft',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchases TO authenticated;
GRANT ALL ON public.purchases TO service_role;
ALTER TABLE public.purchases ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchases own" ON public.purchases FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER purchases_updated BEFORE UPDATE ON public.purchases FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE TABLE public.purchase_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purchase_id uuid NOT NULL REFERENCES public.purchases(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  name text NOT NULL,
  quantity numeric NOT NULL DEFAULT 1,
  unit_cost_cents bigint NOT NULL DEFAULT 0,
  total_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.purchase_items TO authenticated;
GRANT ALL ON public.purchase_items TO service_role;
ALTER TABLE public.purchase_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "purchase_items own" ON public.purchase_items FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.confirm_purchase(_purchase_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  p RECORD;
  it RECORD;
  prev_qty numeric;
  prev_cost bigint;
  new_cost bigint;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = _purchase_id AND user_id = auth.uid();
  IF p IS NULL THEN RAISE EXCEPTION 'Nota não encontrada'; END IF;
  IF p.status = 'confirmed' THEN RAISE EXCEPTION 'Nota já confirmada'; END IF;

  FOR it IN SELECT * FROM public.purchase_items WHERE purchase_id = _purchase_id LOOP
    IF it.product_id IS NOT NULL AND it.quantity > 0 THEN
      SELECT stock_qty, cost_cents INTO prev_qty, prev_cost FROM public.products WHERE id = it.product_id;
      IF prev_qty IS NULL THEN CONTINUE; END IF;
      IF prev_qty < 0 THEN prev_qty := 0; END IF;
      new_cost := CASE WHEN (prev_qty + it.quantity) > 0
        THEN round(((prev_qty * coalesce(prev_cost,0)) + (it.quantity * it.unit_cost_cents)) / (prev_qty + it.quantity))
        ELSE it.unit_cost_cents END;
      UPDATE public.products
        SET stock_qty = coalesce(stock_qty,0) + it.quantity,
            cost_cents = new_cost
        WHERE id = it.product_id;
      INSERT INTO public.stock_movements (user_id, product_id, quantity, reason)
        VALUES (p.user_id, it.product_id, it.quantity, 'compra');
    END IF;
  END LOOP;

  UPDATE public.purchases SET status = 'confirmed' WHERE id = _purchase_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.confirm_purchase(uuid) TO authenticated;
