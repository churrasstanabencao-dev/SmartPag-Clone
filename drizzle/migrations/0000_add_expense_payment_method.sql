ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_method text;
