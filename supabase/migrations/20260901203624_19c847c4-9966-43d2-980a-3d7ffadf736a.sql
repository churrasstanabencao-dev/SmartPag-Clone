-- ROLES
create type public.app_role as enum ('admin','user');

create table public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role app_role not null default 'user',
  created_at timestamptz not null default now(),
  unique (user_id, role)
);
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;
alter table public.user_roles enable row level security;
create policy "own roles" on public.user_roles for select to authenticated using (user_id = auth.uid());

create or replace function public.has_role(_user_id uuid, _role app_role)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

-- PROFILES
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  store_name text not null default 'Minha Loja',
  document text,
  phone text,
  pix_key text,
  balance_cents bigint not null default 0,
  pending_cents bigint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update on public.profiles to authenticated;
grant all on public.profiles to service_role;
alter table public.profiles enable row level security;
create policy "profiles select own" on public.profiles for select to authenticated using (id = auth.uid());
create policy "profiles insert own" on public.profiles for insert to authenticated with check (id = auth.uid());
create policy "profiles update own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, full_name, store_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'full_name',''), coalesce(new.raw_user_meta_data->>'store_name','Minha Loja'))
  on conflict (id) do nothing;
  insert into public.user_roles (user_id, role) values (new.id, 'user') on conflict do nothing;
  return new;
end; $$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin new.updated_at = now(); return new; end; $$;

create trigger profiles_updated before update on public.profiles
for each row execute function public.set_updated_at();

-- CUSTOMERS
create table public.customers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  email text,
  document text,
  phone text,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.customers to authenticated;
grant all on public.customers to service_role;
alter table public.customers enable row level security;
create policy "customers own" on public.customers for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- PRODUCTS
create table public.products (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  price_cents bigint not null default 0,
  slug text not null unique default encode(gen_random_bytes(6),'hex'),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
grant select, insert, update, delete on public.products to authenticated;
grant select on public.products to anon;
grant all on public.products to service_role;
alter table public.products enable row level security;
create policy "products own" on public.products for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "products public active" on public.products for select to anon using (active = true);

create trigger products_updated before update on public.products
for each row execute function public.set_updated_at();

-- TRANSACTIONS
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  customer_id uuid references public.customers(id) on delete set null,
  product_id uuid references public.products(id) on delete set null,
  description text not null default 'Cobrança',
  amount_cents bigint not null,
  fee_cents bigint not null default 0,
  net_cents bigint not null default 0,
  method text not null default 'pix',
  status text not null default 'pending',
  pix_code text,
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
grant select, insert, update, delete on public.transactions to authenticated;
grant all on public.transactions to service_role;
alter table public.transactions enable row level security;
create policy "transactions own" on public.transactions for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create index transactions_user_created on public.transactions (user_id, created_at desc);

-- WITHDRAWALS
create table public.withdrawals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  amount_cents bigint not null,
  pix_key text not null,
  status text not null default 'processing',
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
grant select, insert, update, delete on public.withdrawals to authenticated;
grant all on public.withdrawals to service_role;
alter table public.withdrawals enable row level security;
create policy "withdrawals own" on public.withdrawals for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
