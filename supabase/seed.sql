insert into public.suppliers (code, name_kr, name_en, country_code, payment_terms_days)
values
  ('DAIKEI', '다이케이', 'DAIKEI', 'JP', 14),
  ('DAIYUU', '다이유', 'DAIYUU', 'JP', 14),
  ('HONGJU', '홍주수산', 'Hongju', 'KR', 30),
  ('MIZUMOTO', '미즈모토', 'Mizumoto', 'JP', 21)
on conflict (code) do update
set
  name_kr = excluded.name_kr,
  name_en = excluded.name_en,
  country_code = excluded.country_code,
  payment_terms_days = excluded.payment_terms_days;

insert into public.buyers (code, name, payment_terms_days)
values
  ('BUYER-A', '강남 활어유통', 7),
  ('BUYER-B', '부산 해산물센터', 10),
  ('BUYER-C', '수산마켓24', 14)
on conflict (code) do update
set
  name = excluded.name,
  payment_terms_days = excluded.payment_terms_days;

insert into public.species (code, name_kr, name_en, unit)
values
  ('HAGFISH', '먹장어', 'Hagfish', 'unit'),
  ('MURASAKI', '무라사키', 'Purple Sea Urchin', 'unit'),
  ('KELP_GROUPER', '자바리', 'Kelp Grouper', 'unit')
on conflict (code) do update
set
  name_kr = excluded.name_kr,
  name_en = excluded.name_en,
  unit = excluded.unit;

with d_supplier as (
  select id from public.suppliers where code = 'DAIKEI'
),
d_species as (
  select id from public.species where code = 'HAGFISH'
),
d_buyer as (
  select id from public.buyers where code = 'BUYER-A'
),
seed_shipment as (
  insert into public.shipments (
    shipment_number,
    supplier_id,
    intake_date,
    customs_date,
    fx_rate,
    status,
    notes
  )
  select
    'DEMO-SHIP-2026-001',
    d_supplier.id,
    date '2026-04-01',
    date '2026-04-02',
    9.2100,
    'partially_sold',
    'MVP demo shipment for UI and workflow validation.'
  from d_supplier
  on conflict (shipment_number) do update
  set
    supplier_id = excluded.supplier_id,
    intake_date = excluded.intake_date,
    customs_date = excluded.customs_date,
    fx_rate = excluded.fx_rate,
    status = excluded.status,
    notes = excluded.notes
  returning id, supplier_id
)
insert into public.shipment_line_items (
  shipment_id,
  species_id,
  quantity,
  unit_price_jpy,
  total_jpy,
  grade_code
)
select
  seed_shipment.id,
  d_species.id,
  1200,
  1200,
  1440000,
  'B7'
from seed_shipment, d_species
on conflict do nothing;

with target_shipment as (
  select id from public.shipments where shipment_number = 'DEMO-SHIP-2026-001'
)
insert into public.ancillary_costs (shipment_id, cost_type, amount_krw, cost_date, notes)
select target_shipment.id, x.cost_type, x.amount_krw, x.cost_date, x.notes
from target_shipment,
  (values
    ('customs_fee'::public.ancillary_cost_type, 420000, date '2026-04-02', '통관 수수료'),
    ('domestic_freight'::public.ancillary_cost_type, 280000, date '2026-04-02', '국내 운송'),
    ('tank_fee'::public.ancillary_cost_type, 180000, date '2026-04-03', '수조 보관비')
  ) as x(cost_type, amount_krw, cost_date, notes)
on conflict do nothing;

with
  target_shipment as (
    select id from public.shipments where shipment_number = 'DEMO-SHIP-2026-001'
  ),
  target_species as (
    select id from public.species where code = 'HAGFISH'
  ),
  target_buyer as (
    select id from public.buyers where code = 'BUYER-A'
  )
insert into public.sales (
  shipment_id,
  buyer_id,
  dispatch_date,
  species_id,
  quantity,
  unit_price_krw,
  expected_payment_date,
  status,
  notes
)
select
  target_shipment.id,
  target_buyer.id,
  date '2026-04-04',
  target_species.id,
  440,
  16500,
  date '2026-04-11',
  'invoiced',
  'First dispatch from demo shipment.'
from target_shipment, target_species, target_buyer
on conflict do nothing;

with
  target_shipment as (
    select id from public.shipments where shipment_number = 'DEMO-SHIP-2026-001'
  ),
  target_species as (
    select id from public.species where code = 'HAGFISH'
  )
insert into public.mortality_records (
  shipment_id,
  species_id,
  recorded_date,
  quantity,
  cause,
  notes
)
select
  target_shipment.id,
  target_species.id,
  date '2026-04-05',
  32,
  'transit',
  'Initial stabilization loss.'
from target_shipment, target_species
on conflict do nothing;

with
  target_supplier as (
    select id from public.suppliers where code = 'DAIKEI'
  ),
  target_shipment as (
    select id from public.shipments where shipment_number = 'DEMO-SHIP-2026-001'
  )
insert into public.ap_transactions (
  supplier_id,
  transaction_date,
  type,
  amount_krw,
  shipment_id,
  description
)
select
  target_supplier.id,
  date '2026-04-02',
  'debit',
  15470000,
  target_shipment.id,
  '자동 생성 예시: 배치 입고 확정'
from target_supplier, target_shipment
on conflict do nothing;
