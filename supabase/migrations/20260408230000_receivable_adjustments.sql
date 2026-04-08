create table if not exists public.receivable_adjustments (
  id uuid primary key default gen_random_uuid(),
  buyer_id uuid not null references public.buyers (id) on delete restrict,
  shipment_id uuid references public.shipments (id) on delete set null,
  adjustment_date date not null,
  adjustment_type text not null check (
    adjustment_type in ('bad_debt_writeoff', 'discount', 'correction', 'manual')
  ),
  amount_krw bigint not null check (amount_krw > 0),
  notes text,
  source_key text unique,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index if not exists idx_receivable_adjustments_buyer_date
on public.receivable_adjustments (buyer_id, adjustment_date desc);

create or replace view public.buyer_receivable_balances as
with open_base as (
  select
    b.id as buyer_id,
    b.code,
    b.name,
    coalesce(sum(o.total_krw), 0)::bigint as base_outstanding_krw,
    coalesce(sum(case when o.is_overdue then o.total_krw else 0 end), 0)::bigint as base_overdue_krw,
    count(o.sale_id)::int as open_invoice_count,
    count(*) filter (where o.is_overdue)::int as overdue_invoice_count,
    min(o.expected_payment_date) filter (where o.is_overdue) as oldest_overdue_date
  from public.buyers b
  left join public.open_receivables o on o.buyer_id = b.id
  group by b.id, b.code, b.name
),
adjustment_base as (
  select
    ra.buyer_id,
    coalesce(sum(ra.amount_krw), 0)::bigint as adjustment_krw
  from public.receivable_adjustments ra
  group by ra.buyer_id
)
select
  ob.buyer_id,
  ob.code,
  ob.name,
  greatest(ob.base_outstanding_krw - coalesce(ab.adjustment_krw, 0), 0)::bigint as outstanding_krw,
  greatest(ob.base_overdue_krw - coalesce(ab.adjustment_krw, 0), 0)::bigint as overdue_krw,
  ob.open_invoice_count,
  ob.overdue_invoice_count,
  ob.oldest_overdue_date,
  coalesce(ab.adjustment_krw, 0)::bigint as adjustment_krw
from open_base ob
left join adjustment_base ab on ab.buyer_id = ob.buyer_id;

alter table public.receivable_adjustments enable row level security;

drop policy if exists receivable_adjustments_rw on public.receivable_adjustments;
create policy receivable_adjustments_rw
on public.receivable_adjustments
for all
to authenticated
using (
  public.has_any_role(array['admin', 'operations_manager', 'accounts']::public.app_role[])
)
with check (
  public.has_any_role(array['admin', 'operations_manager', 'accounts']::public.app_role[])
);
