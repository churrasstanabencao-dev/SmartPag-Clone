ALTER TABLE public.store_members
  ADD COLUMN IF NOT EXISTS modules text[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS full_name text,
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS created_by uuid;

CREATE OR REPLACE FUNCTION public.my_modules(_store uuid)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN EXISTS (SELECT 1 FROM public.stores s WHERE s.id = _store AND s.owner_id = auth.uid())
      THEN ARRAY['*']::text[]
    ELSE COALESCE(
      (SELECT CASE WHEN m.active THEN m.modules ELSE '{}'::text[] END
         FROM public.store_members m
        WHERE m.store_id = _store AND m.user_id = auth.uid()
        LIMIT 1),
      '{}'::text[])
  END
$$;

REVOKE ALL ON FUNCTION public.my_modules(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.my_modules(uuid) TO authenticated;
