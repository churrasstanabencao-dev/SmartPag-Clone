-- Brought over from drizzle/migrations so a fresh Supabase project matches the app.

ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS payment_method text;

CREATE TABLE IF NOT EXISTS public.receivables (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  description text NOT NULL,
  amount_cents bigint NOT NULL DEFAULT 0,
  due_date date NOT NULL DEFAULT CURRENT_DATE,
  received boolean NOT NULL DEFAULT false,
  received_at timestamp with time zone,
  received_by uuid,
  payment_method text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.receivables TO authenticated;
GRANT ALL ON public.receivables TO service_role;

ALTER TABLE public.receivables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "receivables store" ON public.receivables;
CREATE POLICY "receivables store" ON public.receivables
  FOR ALL TO authenticated
  USING (user_id = auth.uid() OR public.has_store_access(store_id))
  WITH CHECK (public.has_store_access(store_id));

CREATE INDEX IF NOT EXISTS receivables_store_due_date_idx ON public.receivables (store_id, due_date);
CREATE INDEX IF NOT EXISTS receivables_store_received_idx ON public.receivables (store_id, received);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    BEGIN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.receivables;
    EXCEPTION
      WHEN duplicate_object THEN NULL;
    END;
  END IF;
END $$;
