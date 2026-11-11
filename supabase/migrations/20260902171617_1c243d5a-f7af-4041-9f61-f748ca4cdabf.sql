ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS unit text NOT NULL DEFAULT 'UN',
  ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT 'simples';

CREATE TABLE IF NOT EXISTS public.product_components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  parent_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE RESTRICT,
  quantity numeric NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (parent_product_id, component_product_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_components TO authenticated;
GRANT SELECT ON public.product_components TO anon;
GRANT ALL ON public.product_components TO service_role;

ALTER TABLE public.product_components ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage product components"
ON public.product_components FOR ALL
TO authenticated
USING (public.has_store_access(store_id))
WITH CHECK (public.has_store_access(store_id));

CREATE POLICY "Public menu can read components"
ON public.product_components FOR SELECT
TO anon
USING (public.is_menu_public(store_id));

CREATE TRIGGER product_components_set_updated_at
BEFORE UPDATE ON public.product_components
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
