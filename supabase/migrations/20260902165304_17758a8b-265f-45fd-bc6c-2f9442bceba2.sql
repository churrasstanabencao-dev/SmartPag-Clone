ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS provisioned boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ref_month date,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES auth.users(id);

CREATE INDEX IF NOT EXISTS expenses_store_ref_month_idx
  ON public.expenses (store_id, ref_month);
