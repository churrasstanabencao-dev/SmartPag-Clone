ALTER TABLE public.categories ADD COLUMN IF NOT EXISTS print_sector text NOT NULL DEFAULT 'cozinha';

ALTER TABLE public.tabs
  ADD COLUMN IF NOT EXISTS delivery_fee_cents bigint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS delivery_address text,
  ADD COLUMN IF NOT EXISTS delivery_neighborhood text,
  ADD COLUMN IF NOT EXISTS delivery_reference text,
  ADD COLUMN IF NOT EXISTS courier_employee_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS tabs_courier_idx ON public.tabs(courier_employee_id);
