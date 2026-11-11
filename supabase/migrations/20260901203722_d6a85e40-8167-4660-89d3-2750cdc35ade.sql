-- security lint: revoke public execute on definer/trigger functions
revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.set_updated_at() from anon, authenticated, public;
revoke execute on function public.has_role(uuid, app_role) from anon, public;

drop table if exists public.withdrawals cascade;
drop table if exists public.transactions cascade;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default 'blue',
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.categories to authenticated;
grant all on public.categories to service_role;
alter table public.categories enable row level security;
create policy "categories own" on public.categories for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.products
  add column category_id uuid references public.categories(id) on delete set null,
  add column cost_cents bigint not null default 0,
  add column sku text,
  add column track_stock boolean not null default false,
  add column stock_qty numeric not null default 0,
  add column min_stock numeric not null default 0;

create table public.employees (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  job_title text not null default 'Atendente',
  pin text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.employees to authenticated;
grant all on public.employees to service_role;
alter table public.employees enable row level security;
create policy "employees own" on public.employees for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.tabs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'mesa',
  status text not null default 'open',
  employee_id uuid references public.employees(id) on delete set null,
  customer_id uuid references public.customers(id) on delete set null,
  opened_at timestamptz not null default now(),
  closed_at timestamptz
);
grant select, insert, update, delete on public.tabs to authenticated;
grant all on public.tabs to service_role;
alter table public.tabs enable row level security;
create policy "tabs own" on public.tabs for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index tabs_user_status on public.tabs (user_id, status, opened_at desc);

create table public.tab_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tab_id uuid not null references public.tabs(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  name text not null,
  quantity numeric not null default 1,
  unit_price_cents bigint not null default 0,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.tab_items to authenticated;
grant all on public.tab_items to service_role;
alter table public.tab_items enable row level security;
create policy "tab_items own" on public.tab_items for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index tab_items_tab on public.tab_items (tab_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tab_id uuid references public.tabs(id) on delete set null,
  method text not null default 'pix',
  amount_cents bigint not null default 0,
  paid_at timestamptz not null default now()
);
grant select, insert, update, delete on public.payments to authenticated;
grant all on public.payments to service_role;
alter table public.payments enable row level security;
create policy "payments own" on public.payments for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create index payments_user_paid on public.payments (user_id, paid_at desc);

create table public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  quantity numeric not null,
  reason text not null default 'ajuste',
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.stock_movements to authenticated;
grant all on public.stock_movements to service_role;
alter table public.stock_movements enable row level security;
create policy "stock_movements own" on public.stock_movements for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  amount_cents bigint not null default 0,
  category text not null default 'geral',
  due_date date not null default current_date,
  paid boolean not null default false,
  created_at timestamptz not null default now()
);
grant select, insert, update, delete on public.expenses to authenticated;
grant all on public.expenses to service_role;
alter table public.expenses enable row level security;
create policy "expenses own" on public.expenses for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
