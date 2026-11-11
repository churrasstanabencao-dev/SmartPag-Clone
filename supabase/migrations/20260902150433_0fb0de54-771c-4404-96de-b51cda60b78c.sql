ALTER TABLE public.cash_registers
  ADD COLUMN IF NOT EXISTS counted_breakdown jsonb,
  ADD COLUMN IF NOT EXISTS expected_cash_cents bigint,
  ADD COLUMN IF NOT EXISTS difference_cents bigint,
  ADD COLUMN IF NOT EXISTS closed_by uuid REFERENCES auth.users(id);

ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS commission_pct numeric NOT NULL DEFAULT 0;

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS menu_public boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS menu_slug text;

CREATE UNIQUE INDEX IF NOT EXISTS stores_menu_slug_key ON public.stores (menu_slug) WHERE menu_slug IS NOT NULL;

CREATE OR REPLACE FUNCTION public.is_menu_public(_store uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.stores s WHERE s.id = _store AND s.menu_public AND s.active)
$$;

GRANT SELECT ON public.stores TO anon;
GRANT SELECT ON public.categories TO anon;
GRANT SELECT ON public.products TO anon;

DROP POLICY IF EXISTS "Public menu stores are viewable" ON public.stores;
CREATE POLICY "Public menu stores are viewable" ON public.stores
  FOR SELECT TO anon USING (menu_public AND active);

DROP POLICY IF EXISTS "Public menu categories are viewable" ON public.categories;
CREATE POLICY "Public menu categories are viewable" ON public.categories
  FOR SELECT TO anon USING (public.is_menu_public(store_id));

DROP POLICY IF EXISTS "Public menu products are viewable" ON public.products;
CREATE POLICY "Public menu products are viewable" ON public.products
  FOR SELECT TO anon USING (active AND public.is_menu_public(store_id));
