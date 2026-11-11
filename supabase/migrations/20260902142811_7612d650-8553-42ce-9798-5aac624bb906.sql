CREATE TABLE public.whatsapp_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL UNIQUE,
  name text,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'manager',
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_contacts TO authenticated;
GRANT ALL ON public.whatsapp_contacts TO service_role;

ALTER TABLE public.whatsapp_contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores gerenciam contatos whatsapp"
ON public.whatsapp_contacts
FOR ALL
TO authenticated
USING (
  store_id IS NULL OR public.has_store_access(store_id)
)
WITH CHECK (
  store_id IS NULL OR public.can_manage_store(store_id)
);

CREATE TABLE public.whatsapp_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  direction text NOT NULL DEFAULT 'in',
  body text,
  media_url text,
  message_sid text,
  status text NOT NULL DEFAULT 'processed',
  pending_action jsonb,
  store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.whatsapp_messages TO authenticated;
GRANT ALL ON public.whatsapp_messages TO service_role;

ALTER TABLE public.whatsapp_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Gestores veem mensagens whatsapp"
ON public.whatsapp_messages
FOR ALL
TO authenticated
USING (
  store_id IS NULL OR public.has_store_access(store_id)
)
WITH CHECK (
  store_id IS NULL OR public.has_store_access(store_id)
);
