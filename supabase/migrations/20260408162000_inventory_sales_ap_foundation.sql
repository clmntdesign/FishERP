create unique index if not exists idx_ap_transactions_unique_shipment_debit
on public.ap_transactions (shipment_id)
where shipment_id is not null and type = 'debit';

create index if not exists idx_sales_shipment_species
on public.sales (shipment_id, species_id);

create index if not exists idx_mortality_shipment_species
on public.mortality_records (shipment_id, species_id);

create or replace view public.shipment_species_inventory_summary as
with intake as (
  select
    li.shipment_id,
    li.species_id,
    coalesce(sum(li.quantity), 0)::numeric as intake_qty
  from public.shipment_line_items li
  group by li.shipment_id, li.species_id
),
sales as (
  select
    sa.shipment_id,
    sa.species_id,
    coalesce(sum(sa.quantity), 0)::numeric as sold_qty
  from public.sales sa
  where sa.shipment_id is not null
  group by sa.shipment_id, sa.species_id
),
mortality as (
  select
    mr.shipment_id,
    mr.species_id,
    coalesce(sum(mr.quantity), 0)::numeric as mortality_qty
  from public.mortality_records mr
  group by mr.shipment_id, mr.species_id
)
select
  sh.id as shipment_id,
  sh.shipment_number,
  sh.status,
  sh.intake_date,
  i.species_id,
  sp.code as species_code,
  sp.name_kr as species_name_kr,
  i.intake_qty,
  coalesce(sa.sold_qty, 0)::numeric as sold_qty,
  coalesce(mo.mortality_qty, 0)::numeric as mortality_qty,
  (i.intake_qty - coalesce(sa.sold_qty, 0) - coalesce(mo.mortality_qty, 0))::numeric as remaining_qty
from intake i
join public.shipments sh on sh.id = i.shipment_id
join public.species sp on sp.id = i.species_id
left join sales sa on sa.shipment_id = i.shipment_id and sa.species_id = i.species_id
left join mortality mo on mo.shipment_id = i.shipment_id and mo.species_id = i.species_id;
