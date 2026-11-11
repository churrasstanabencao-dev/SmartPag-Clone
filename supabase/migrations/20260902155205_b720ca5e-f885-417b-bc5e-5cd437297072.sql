-- Subcategorias
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS parent_id uuid REFERENCES public.categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS categories_parent_id_idx ON public.categories(parent_id);

-- CRM delivery: campos extras do cliente
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS address_number text,
  ADD COLUMN IF NOT EXISTS complement text,
  ADD COLUMN IF NOT EXISTS neighborhood text,
  ADD COLUMN IF NOT EXISTS city text,
  ADD COLUMN IF NOT EXISTS zip_code text,
  ADD COLUMN IF NOT EXISTS reference_point text,
  ADD COLUMN IF NOT EXISTS birthdate date,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS is_delivery boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS source text;

-- Fornecedores
CREATE TABLE IF NOT EXISTS public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  name text NOT NULL,
  contact_name text,
  phone text,
  email text,
  document text,
  address text,
  notes text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members manage suppliers of their store"
ON public.suppliers FOR ALL TO authenticated
USING (auth.uid() = user_id OR (store_id IS NOT NULL AND public.has_store_access(store_id)))
WITH CHECK (auth.uid() = user_id OR (store_id IS NOT NULL AND public.has_store_access(store_id)));

CREATE TRIGGER suppliers_set_updated_at
BEFORE UPDATE ON public.suppliers
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
