ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS base_salary_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pay_type text NOT NULL DEFAULT 'mensal';
