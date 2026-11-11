ALTER TABLE public.tabs
  ADD COLUMN IF NOT EXISTS delivery_status text NOT NULL DEFAULT 'fila',
  ADD COLUMN IF NOT EXISTS customer_name text,
  ADD COLUMN IF NOT EXISTS customer_phone text;

ALTER TABLE public.tabs
  DROP CONSTRAINT IF EXISTS tabs_delivery_status_check;

ALTER TABLE public.tabs
  ADD CONSTRAINT tabs_delivery_status_check
  CHECK (delivery_status IN ('fila','entrega','finalizado'));

CREATE INDEX IF NOT EXISTS tabs_delivery_status_idx
  ON public.tabs (store_id, delivery_status);
