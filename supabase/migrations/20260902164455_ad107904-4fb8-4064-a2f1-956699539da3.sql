ALTER TABLE public.store_members ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL;

CREATE TABLE public.employee_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  kind text NOT NULL DEFAULT 'diaria',
  description text NOT NULL DEFAULT '',
  amount_cents bigint NOT NULL DEFAULT 0,
  ref_date date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  paid boolean NOT NULL DEFAULT false,
  tab_id uuid REFERENCES public.tabs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX employee_entries_store_idx ON public.employee_entries (store_id, ref_date);
CREATE INDEX employee_entries_employee_idx ON public.employee_entries (employee_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.employee_entries TO authenticated;
GRANT ALL ON public.employee_entries TO service_role;

ALTER TABLE public.employee_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Store members manage employee entries"
  ON public.employee_entries FOR ALL TO authenticated
  USING (public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

CREATE TRIGGER employee_entries_updated
  BEFORE UPDATE ON public.employee_entries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
