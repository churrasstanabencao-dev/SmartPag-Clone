CREATE TABLE public.cash_registers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Caixa',
  opening_cents bigint not null default 0,
  closing_counted_cents bigint,
  notes text,
  status text not null default 'open',
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_registers TO authenticated;
GRANT ALL ON public.cash_registers TO service_role;
ALTER TABLE public.cash_registers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cash_registers own" ON public.cash_registers FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.cash_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  register_id uuid not null references public.cash_registers(id) on delete cascade,
  kind text not null default 'entrada',
  description text not null,
  amount_cents bigint not null default 0,
  method text not null default 'dinheiro',
  created_at timestamptz not null default now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_movements TO authenticated;
GRANT ALL ON public.cash_movements TO service_role;
ALTER TABLE public.cash_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "cash_movements own" ON public.cash_movements FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE INDEX cash_movements_register_idx ON public.cash_movements(register_id);
CREATE INDEX cash_registers_user_status_idx ON public.cash_registers(user_id, status);

ALTER TABLE public.payments ADD COLUMN register_id uuid REFERENCES public.cash_registers(id) ON DELETE SET NULL;
CREATE INDEX payments_register_idx ON public.payments(register_id);

CREATE TRIGGER cash_registers_updated BEFORE UPDATE ON public.cash_registers FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
