ALTER TABLE public.tabs REPLICA IDENTITY FULL;
ALTER TABLE public.tab_items REPLICA IDENTITY FULL;
ALTER TABLE public.payments REPLICA IDENTITY FULL;
ALTER TABLE public.cash_movements REPLICA IDENTITY FULL;
ALTER TABLE public.cash_registers REPLICA IDENTITY FULL;
ALTER TABLE public.expenses REPLICA IDENTITY FULL;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tabs','tab_items','payments','cash_movements','cash_registers','expenses'] LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
