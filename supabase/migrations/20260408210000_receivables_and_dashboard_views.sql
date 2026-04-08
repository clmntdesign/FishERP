create index if not exists idx_sales_receivable_open
on public.sales (expected_payment_date, buyer_id)
where status <> 'paid' and actual_payment_date is null;

create index if not exists idx_sales_status_expected_date
on public.sales (status, expected_payment_date);

create or replace view public.open_receivables as
select
  sa.id as sale_id,
  sa.buyer_id,
  b.code as buyer_code,
  b.name as buyer_name,
  sa.shipment_id,
  sh.shipment_number,
  sa.species_id,
  sp.code as species_code,
  sp.name_kr as species_name_kr,
  sa.dispatch_date,
  sa.expected_payment_date,
  sa.actual_payment_date,
  sa.status,
  sa.total_krw,
  case
    when sa.expected_payment_date is null then null
    else greatest((current_date - sa.expected_payment_date), 0)::int
  end as days_overdue,
  case
    when sa.expected_payment_date is null then 'no_due_date'
    when sa.expected_payment_date >= current_date then 'not_due'
    when (current_date - sa.expected_payment_date) between 1 and 7 then 'overdue_1_7'
    when (current_date - sa.expected_payment_date) between 8 and 30 then 'overdue_8_30'
    else 'overdue_31_plus'
  end as aging_bucket,
  (sa.expected_payment_date is not null and sa.expected_payment_date < current_date) as is_overdue
from public.sales sa
join public.buyers b on b.id = sa.buyer_id
left join public.shipments sh on sh.id = sa.shipment_id
join public.species sp on sp.id = sa.species_id
where sa.status <> 'paid'
  and sa.actual_payment_date is null;

create or replace view public.receivable_aging_summary as
select
  o.aging_bucket,
  case o.aging_bucket
    when 'no_due_date' then '예정일 미입력'
    when 'not_due' then '기한 내'
    when 'overdue_1_7' then '1-7일 지연'
    when 'overdue_8_30' then '8-30일 지연'
    else '31일 이상 지연'
  end as aging_bucket_ko,
  count(*)::int as invoice_count,
  coalesce(sum(o.total_krw), 0)::bigint as amount_krw
from public.open_receivables o
group by o.aging_bucket;

create or replace view public.buyer_receivable_balances as
select
  b.id as buyer_id,
  b.code,
  b.name,
  coalesce(sum(o.total_krw), 0)::bigint as outstanding_krw,
  coalesce(sum(case when o.is_overdue then o.total_krw else 0 end), 0)::bigint as overdue_krw,
  count(o.sale_id)::int as open_invoice_count,
  count(*) filter (where o.is_overdue)::int as overdue_invoice_count,
  min(o.expected_payment_date) filter (where o.is_overdue) as oldest_overdue_date
from public.buyers b
left join public.open_receivables o on o.buyer_id = b.id
group by b.id, b.code, b.name;

create or replace view public.ap_payment_allocation_summary as
select
  p.id as ap_payment_id,
  p.supplier_id,
  p.payment_date,
  p.total_amount_krw,
  coalesce(sum(a.allocated_amount_krw), 0)::bigint as allocated_amount_krw,
  (p.total_amount_krw - coalesce(sum(a.allocated_amount_krw), 0))::bigint as unallocated_amount_krw
from public.ap_payments p
left join public.ap_payment_allocations a on a.ap_payment_id = p.id
group by p.id, p.supplier_id, p.payment_date, p.total_amount_krw;
