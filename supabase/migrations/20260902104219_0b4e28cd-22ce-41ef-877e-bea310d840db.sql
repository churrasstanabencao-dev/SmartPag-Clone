-- 1. STORES
CREATE TABLE public.stores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  parent_id uuid REFERENCES public.stores(id) ON DELETE SET NULL,
  name text NOT NULL,
  code text,
  is_matriz boolean NOT NULL DEFAULT false,
  phone text,
  address text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores TO authenticated;
GRANT ALL ON public.stores TO service_role;
ALTER TABLE public.stores ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.store_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'staff',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_members TO authenticated;
GRANT ALL ON public.store_members TO service_role;
ALTER TABLE public.store_members ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER stores_updated BEFORE UPDATE ON public.stores FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 2. ACCESS FUNCTIONS
CREATE OR REPLACE FUNCTION public.is_store_member(_store uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.store_members m WHERE m.store_id = _store AND m.user_id = auth.uid())
$$;

CREATE OR REPLACE FUNCTION public.has_store_access(_store uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT _store IS NOT NULL AND (
    EXISTS (SELECT 1 FROM public.store_members m WHERE m.store_id = _store AND m.user_id = auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.stores s
      JOIN public.store_members m ON m.store_id = s.parent_id
      WHERE s.id = _store AND m.user_id = auth.uid()
    )
  )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_store(_store uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.store_members m WHERE m.store_id = _store AND m.user_id = auth.uid() AND m.role IN ('owner','manager')
  ) OR EXISTS (
    SELECT 1 FROM public.stores s
    JOIN public.store_members m ON m.store_id = s.parent_id
    WHERE s.id = _store AND m.user_id = auth.uid() AND m.role IN ('owner','manager')
  )
$$;

CREATE POLICY "stores read" ON public.stores FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.has_store_access(id));
CREATE POLICY "stores insert" ON public.stores FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid() AND (parent_id IS NULL OR public.can_manage_store(parent_id)));
CREATE POLICY "stores update" ON public.stores FOR UPDATE TO authenticated
  USING (owner_id = auth.uid() OR public.can_manage_store(id))
  WITH CHECK (owner_id = auth.uid() OR public.can_manage_store(id));
CREATE POLICY "stores delete" ON public.stores FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

CREATE POLICY "store_members read" ON public.store_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id));
CREATE POLICY "store_members manage" ON public.store_members FOR INSERT TO authenticated
  WITH CHECK (public.can_manage_store(store_id) OR EXISTS (SELECT 1 FROM public.stores s WHERE s.id = store_id AND s.owner_id = auth.uid()));
CREATE POLICY "store_members update" ON public.store_members FOR UPDATE TO authenticated
  USING (public.can_manage_store(store_id)) WITH CHECK (public.can_manage_store(store_id));
CREATE POLICY "store_members delete" ON public.store_members FOR DELETE TO authenticated
  USING (public.can_manage_store(store_id));

-- 3. ADD store_id TO OPERATIONAL TABLES
ALTER TABLE public.categories ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.products ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.customers ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.employees ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.expenses ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.tabs ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.tab_items ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.payments ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.stock_movements ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.purchases ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.purchase_items ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.cash_registers ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;
ALTER TABLE public.cash_movements ADD COLUMN store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE;

-- 4. BACKFILL: one matriz store per existing user
INSERT INTO public.stores (owner_id, name, is_matriz, code)
SELECT p.id, coalesce(nullif(p.store_name,''),'Minha Loja'), true, 'MATRIZ'
FROM public.profiles p;

INSERT INTO public.store_members (store_id, user_id, role)
SELECT s.id, s.owner_id, 'owner' FROM public.stores s
ON CONFLICT DO NOTHING;

UPDATE public.categories t SET store_id = s.id FROM public.stores s WHERE s.owner_id = t.user_id AND s.is_matriz AND t.store_id IS NULL;
UPDATE public.products t SET store_id = s.id FROM public.stores s WHERE s.owner_id = t.user_id AND s.is_matriz AND t.store_id IS NULL;
UPDATE public.customers t SET store_id = s.id FROM public.stores s WHERE s.owner_id = t.user_id AND s.is_matriz AND t.store_id IS NULL;
UPDATE public.employees t SET store_id = s.id FROM public.stores s WHERE s.owner_id = t.user_id AND s.is_matriz AND t.store_id IS NULL;
UPDATE public.expenses t SET store_id = s.id FROM public.stores s WHERE s.owner_id = t.user_id AND s.is_matriz AND t.store_id IS NULL;
UPDATE public.tabs t SET store_id = s.id FROM public.stores s WHERE s.owner_id = t.user_id AND s.is_matriz AND t.store_id IS NULL;
UPDATE public.tab_items t SET store_id = s.id FROM public.stores s WHERE s.owner_id = t.user_id AND s.is_matriz AND t.store_id IS NULL;
UPDATE public.payments t SET store_id = s.id FROM public.stores s WHERE s.owner_id = t.user_id AND s.is_matriz AND t.store_id IS NULL;
UPDATE public.stock_movements t SET store_id = s.id FROM public.stores s WHERE s.owner_id = t.user_id AND s.is_matriz AND t.store_id IS NULL;
UPDATE public.purchases t SET store_id = s.id FROM public.stores s WHERE s.owner_id = t.user_id AND s.is_matriz AND t.store_id IS NULL;
UPDATE public.purchase_items t SET store_id = s.id FROM public.stores s WHERE s.owner_id = t.user_id AND s.is_matriz AND t.store_id IS NULL;
UPDATE public.cash_registers t SET store_id = s.id FROM public.stores s WHERE s.owner_id = t.user_id AND s.is_matriz AND t.store_id IS NULL;
UPDATE public.cash_movements t SET store_id = s.id FROM public.stores s WHERE s.owner_id = t.user_id AND s.is_matriz AND t.store_id IS NULL;

CREATE INDEX ON public.categories (store_id);
CREATE INDEX ON public.products (store_id);
CREATE INDEX ON public.tabs (store_id);
CREATE INDEX ON public.tab_items (store_id);
CREATE INDEX ON public.payments (store_id);
CREATE INDEX ON public.stock_movements (store_id);
CREATE INDEX ON public.purchases (store_id);
CREATE INDEX ON public.cash_registers (store_id);
CREATE INDEX ON public.cash_movements (store_id);

-- 5. REPLACE RLS POLICIES WITH STORE-SCOPED ONES
DROP POLICY IF EXISTS "categories own" ON public.categories;
CREATE POLICY "categories store" ON public.categories FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "products own" ON public.products;
CREATE POLICY "products store" ON public.products FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "customers own" ON public.customers;
CREATE POLICY "customers store" ON public.customers FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "employees own" ON public.employees;
CREATE POLICY "employees store" ON public.employees FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "expenses own" ON public.expenses;
CREATE POLICY "expenses store" ON public.expenses FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "tabs own" ON public.tabs;
CREATE POLICY "tabs store" ON public.tabs FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "tab_items own" ON public.tab_items;
CREATE POLICY "tab_items store" ON public.tab_items FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "payments own" ON public.payments;
CREATE POLICY "payments store" ON public.payments FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "stock_movements own" ON public.stock_movements;
CREATE POLICY "stock_movements store" ON public.stock_movements FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "purchases own" ON public.purchases;
CREATE POLICY "purchases store" ON public.purchases FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "purchase_items own" ON public.purchase_items;
CREATE POLICY "purchase_items store" ON public.purchase_items FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "cash_registers own" ON public.cash_registers;
CREATE POLICY "cash_registers store" ON public.cash_registers FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

DROP POLICY IF EXISTS "cash_movements own" ON public.cash_movements;
CREATE POLICY "cash_movements store" ON public.cash_movements FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

-- 6. NEW USERS GET A MATRIZ STORE
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
declare v_store uuid;
begin
  insert into public.profiles (id, full_name, store_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.raw_user_meta_data->>'store_name','Minha Loja'))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'user') on conflict do nothing;
  insert into public.stores (owner_id, name, is_matriz, code)
  values (new.id, coalesce(new.raw_user_meta_data->>'store_name','Minha Loja'), true, 'MATRIZ')
  returning id into v_store;
  insert into public.store_members (store_id, user_id, role) values (v_store, new.id, 'owner') on conflict do nothing;
  return new;
end; $$;

-- 7. PURCHASE CONFIRM: store aware
CREATE OR REPLACE FUNCTION public.confirm_purchase(_purchase_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  p RECORD; it RECORD; prev_qty numeric; prev_cost bigint; new_cost bigint;
BEGIN
  SELECT * INTO p FROM public.purchases WHERE id = _purchase_id;
  IF p IS NULL THEN RAISE EXCEPTION 'Nota não encontrada'; END IF;
  IF NOT (p.user_id = auth.uid() OR public.has_store_access(p.store_id)) THEN RAISE EXCEPTION 'Sem acesso'; END IF;
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
        SET stock_qty = coalesce(stock_qty,0) + it.quantity, cost_cents = new_cost
        WHERE id = it.product_id;
      INSERT INTO public.stock_movements (user_id, product_id, quantity, reason, store_id)
        VALUES (p.user_id, it.product_id, it.quantity, 'compra', p.store_id);
    END IF;
  END LOOP;

  UPDATE public.purchases SET status = 'confirmed' WHERE id = _purchase_id;
END;
$$;
