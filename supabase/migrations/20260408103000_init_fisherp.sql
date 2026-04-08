create extension if not exists pgcrypto;

do $$ begin
  create type public.app_role as enum (
    'admin',
    'operations_manager',
    'procurement_officer',
    'accounts',
    'viewer'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.shipment_status as enum (
    'pending_customs',
    'in_tank',
    'partially_sold',
    'completed'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.sale_status as enum (
    'dispatched',
    'invoiced',
    'paid',
    'overdue'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.ap_transaction_type as enum (
    'debit',
    'credit',
    'bad_debt_writeoff'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.ancillary_cost_type as enum (
    'tank_fee',
    'day_labor_intake',
    'domestic_freight',
    'customs_fee',
    'extra_inspection',
    'net_cost',
    'travel_expense',
    'day_labor_management',
    'liquid_oxygen',
    'other'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type public.mortality_cause as enum (
    'transit',
    'disease',
    'equipment',
    'unknown'
  );
exception when duplicate_object then null;
end $$;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null default '',
  role public.app_role not null default 'admin',
  locale text not null default 'ko',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_kr text not null,
  name_en text,
  country_code text not null default 'JP',
  payment_terms_days integer not null default 30,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (char_length(country_code) = 2)
);

create table if not exists public.buyers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  contact_name text,
  phone text,
  payment_terms_days integer not null default 14,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.species (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name_kr text not null,
  name_en text,
  unit text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (unit in ('unit', 'kg'))
);

create table if not exists public.shipments (
  id uuid primary key default gen_random_uuid(),
  shipment_number text not null unique,
  supplier_id uuid not null references public.suppliers (id),
  intake_date date not null,
  customs_date date,
  customs_permit_number text,
  assigned_buyer_id uuid references public.profiles (id),
  fx_rate numeric(10, 4),
  status public.shipment_status not null default 'pending_customs',
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (fx_rate is null or fx_rate > 0)
);

create table if not exists public.shipment_line_items (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  species_id uuid not null references public.species (id),
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_price_jpy integer not null check (unit_price_jpy >= 0),
  total_jpy numeric(14, 2) not null check (total_jpy >= 0),
  grade_code text,
  created_at timestamptz not null default now()
);

create table if not exists public.ancillary_costs (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  cost_type public.ancillary_cost_type not null,
  amount_krw bigint not null check (amount_krw >= 0),
  cost_date date not null,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.sales (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid references public.shipments (id),
  buyer_id uuid not null references public.buyers (id),
  dispatch_date date not null,
  species_id uuid not null references public.species (id),
  quantity numeric(12, 2) not null check (quantity > 0),
  unit_price_krw bigint not null check (unit_price_krw >= 0),
  total_krw bigint generated always as ((quantity * unit_price_krw)::bigint) stored,
  expected_payment_date date,
  actual_payment_date date,
  status public.sale_status not null default 'dispatched',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.mortality_records (
  id uuid primary key default gen_random_uuid(),
  shipment_id uuid not null references public.shipments (id) on delete cascade,
  species_id uuid not null references public.species (id),
  recorded_date date not null,
  quantity numeric(12, 2) not null check (quantity > 0),
  cause public.mortality_cause not null default 'unknown',
  notes text,
  recorded_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table if not exists public.ap_transactions (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  transaction_date date not null,
  type public.ap_transaction_type not null,
  amount_krw bigint not null check (amount_krw > 0),
  shipment_id uuid references public.shipments (id),
  bank_reference text,
  description text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ap_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers (id),
  payment_date date not null,
  total_amount_krw bigint not null check (total_amount_krw > 0),
  bank_reference text,
  notes text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ap_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  ap_payment_id uuid not null references public.ap_payments (id) on delete cascade,
  ap_transaction_id uuid not null references public.ap_transactions (id) on delete cascade,
  allocated_amount_krw bigint not null check (allocated_amount_krw > 0),
  created_at timestamptz not null default now(),
  unique (ap_payment_id, ap_transaction_id)
);

create index if not exists idx_shipments_supplier_id on public.shipments (supplier_id);
create index if not exists idx_shipments_intake_date on public.shipments (intake_date desc);
create index if not exists idx_shipment_line_items_shipment_id on public.shipment_line_items (shipment_id);
create index if not exists idx_sales_shipment_id on public.sales (shipment_id);
create index if not exists idx_sales_buyer_id on public.sales (buyer_id);
create index if not exists idx_ap_transactions_supplier_date on public.ap_transactions (supplier_id, transaction_date desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_profiles_updated_at on public.profiles;
create trigger set_profiles_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists set_suppliers_updated_at on public.suppliers;
create trigger set_suppliers_updated_at
before update on public.suppliers
for each row execute function public.set_updated_at();

drop trigger if exists set_buyers_updated_at on public.buyers;
create trigger set_buyers_updated_at
before update on public.buyers
for each row execute function public.set_updated_at();

drop trigger if exists set_species_updated_at on public.species;
create trigger set_species_updated_at
before update on public.species
for each row execute function public.set_updated_at();

drop trigger if exists set_shipments_updated_at on public.shipments;
create trigger set_shipments_updated_at
before update on public.shipments
for each row execute function public.set_updated_at();

drop trigger if exists set_sales_updated_at on public.sales;
create trigger set_sales_updated_at
before update on public.sales
for each row execute function public.set_updated_at();

drop trigger if exists set_ap_transactions_updated_at on public.ap_transactions;
create trigger set_ap_transactions_updated_at
before update on public.ap_transactions
for each row execute function public.set_updated_at();

drop trigger if exists set_ap_payments_updated_at on public.ap_payments;
create trigger set_ap_payments_updated_at
before update on public.ap_payments
for each row execute function public.set_updated_at();

alter table public.profiles enable row level security;
alter table public.suppliers enable row level security;
alter table public.buyers enable row level security;
alter table public.species enable row level security;
alter table public.shipments enable row level security;
alter table public.shipment_line_items enable row level security;
alter table public.ancillary_costs enable row level security;
alter table public.sales enable row level security;
alter table public.mortality_records enable row level security;
alter table public.ap_transactions enable row level security;
alter table public.ap_payments enable row level security;
alter table public.ap_payment_allocations enable row level security;

create policy "auth_all_profiles"
on public.profiles
for all
to authenticated
using (true)
with check (true);

create policy "auth_all_suppliers"
on public.suppliers
for all
to authenticated
using (true)
with check (true);

create policy "auth_all_buyers"
on public.buyers
for all
to authenticated
using (true)
with check (true);

create policy "auth_all_species"
on public.species
for all
to authenticated
using (true)
with check (true);

create policy "auth_all_shipments"
on public.shipments
for all
to authenticated
using (true)
with check (true);

create policy "auth_all_shipment_line_items"
on public.shipment_line_items
for all
to authenticated
using (true)
with check (true);

create policy "auth_all_ancillary_costs"
on public.ancillary_costs
for all
to authenticated
using (true)
with check (true);

create policy "auth_all_sales"
on public.sales
for all
to authenticated
using (true)
with check (true);

create policy "auth_all_mortality_records"
on public.mortality_records
for all
to authenticated
using (true)
with check (true);

create policy "auth_all_ap_transactions"
on public.ap_transactions
for all
to authenticated
using (true)
with check (true);

create policy "auth_all_ap_payments"
on public.ap_payments
for all
to authenticated
using (true)
with check (true);

create policy "auth_all_ap_payment_allocations"
on public.ap_payment_allocations
for all
to authenticated
using (true)
with check (true);

create or replace view public.supplier_balances as
select
  s.id as supplier_id,
  s.code,
  s.name_kr,
  s.name_en,
  coalesce(sum(
    case
      when t.type = 'debit' then t.amount_krw
      when t.type in ('credit', 'bad_debt_writeoff') then -t.amount_krw
      else 0
    end
  ), 0)::bigint as outstanding_krw
from public.suppliers s
left join public.ap_transactions t on t.supplier_id = s.id
group by s.id, s.code, s.name_kr, s.name_en;

create or replace view public.shipment_inventory_summary as
select
  sh.id as shipment_id,
  sh.shipment_number,
  coalesce(sum(li.quantity), 0) as intake_qty,
  coalesce((
    select sum(sa.quantity)
    from public.sales sa
    where sa.shipment_id = sh.id
  ), 0) as sold_qty,
  coalesce((
    select sum(mr.quantity)
    from public.mortality_records mr
    where mr.shipment_id = sh.id
  ), 0) as mortality_qty,
  coalesce(sum(li.quantity), 0)
    - coalesce((select sum(sa.quantity) from public.sales sa where sa.shipment_id = sh.id), 0)
    - coalesce((select sum(mr.quantity) from public.mortality_records mr where mr.shipment_id = sh.id), 0)
    as remaining_qty
from public.shipments sh
left join public.shipment_line_items li on li.shipment_id = sh.id
group by sh.id, sh.shipment_number;
