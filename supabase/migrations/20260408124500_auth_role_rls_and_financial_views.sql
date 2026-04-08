create or replace function public.current_app_role()
returns public.app_role
language sql
stable
security definer
set search_path = public
as $$
  select role
  from public.profiles
  where id = auth.uid();
$$;

create or replace function public.has_any_role(allowed_roles public.app_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.current_app_role() = any(allowed_roles), false);
$$;

grant execute on function public.current_app_role() to authenticated;
grant execute on function public.has_any_role(public.app_role[]) to authenticated;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    'admin',
    'ko'
  )
  on conflict (id) do update
  set
    full_name = excluded.full_name,
    updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

insert into public.profiles (id, full_name, role, locale)
select
  u.id,
  coalesce(u.raw_user_meta_data ->> 'full_name', ''),
  'admin',
  'ko'
from auth.users u
left join public.profiles p on p.id = u.id
where p.id is null;

drop policy if exists "auth_all_profiles" on public.profiles;
drop policy if exists "auth_all_suppliers" on public.suppliers;
drop policy if exists "auth_all_buyers" on public.buyers;
drop policy if exists "auth_all_species" on public.species;
drop policy if exists "auth_all_shipments" on public.shipments;
drop policy if exists "auth_all_shipment_line_items" on public.shipment_line_items;
drop policy if exists "auth_all_ancillary_costs" on public.ancillary_costs;
drop policy if exists "auth_all_sales" on public.sales;
drop policy if exists "auth_all_mortality_records" on public.mortality_records;
drop policy if exists "auth_all_ap_transactions" on public.ap_transactions;
drop policy if exists "auth_all_ap_payments" on public.ap_payments;
drop policy if exists "auth_all_ap_payment_allocations" on public.ap_payment_allocations;

create policy profiles_select_self_or_admin
on public.profiles
for select
to authenticated
using (id = auth.uid() or public.has_any_role(array['admin']::public.app_role[]));

create policy profiles_insert_self_or_admin
on public.profiles
for insert
to authenticated
with check (id = auth.uid() or public.has_any_role(array['admin']::public.app_role[]));

create policy profiles_update_self_or_admin
on public.profiles
for update
to authenticated
using (id = auth.uid() or public.has_any_role(array['admin']::public.app_role[]))
with check (id = auth.uid() or public.has_any_role(array['admin']::public.app_role[]));

create policy suppliers_read
on public.suppliers
for select
to authenticated
using (true);

create policy suppliers_insert
on public.suppliers
for insert
to authenticated
with check (
  public.has_any_role(array['admin', 'operations_manager']::public.app_role[])
);

create policy suppliers_update
on public.suppliers
for update
to authenticated
using (public.has_any_role(array['admin', 'operations_manager']::public.app_role[]))
with check (public.has_any_role(array['admin', 'operations_manager']::public.app_role[]));

create policy suppliers_delete
on public.suppliers
for delete
to authenticated
using (public.has_any_role(array['admin']::public.app_role[]));

create policy buyers_read
on public.buyers
for select
to authenticated
using (true);

create policy buyers_insert
on public.buyers
for insert
to authenticated
with check (
  public.has_any_role(array['admin', 'operations_manager']::public.app_role[])
);

create policy buyers_update
on public.buyers
for update
to authenticated
using (public.has_any_role(array['admin', 'operations_manager']::public.app_role[]))
with check (public.has_any_role(array['admin', 'operations_manager']::public.app_role[]));

create policy buyers_delete
on public.buyers
for delete
to authenticated
using (public.has_any_role(array['admin']::public.app_role[]));

create policy species_read
on public.species
for select
to authenticated
using (true);

create policy species_insert
on public.species
for insert
to authenticated
with check (
  public.has_any_role(array['admin', 'operations_manager']::public.app_role[])
);

create policy species_update
on public.species
for update
to authenticated
using (public.has_any_role(array['admin', 'operations_manager']::public.app_role[]))
with check (public.has_any_role(array['admin', 'operations_manager']::public.app_role[]));

create policy species_delete
on public.species
for delete
to authenticated
using (public.has_any_role(array['admin']::public.app_role[]));

create policy shipments_read
on public.shipments
for select
to authenticated
using (true);

create policy shipments_insert
on public.shipments
for insert
to authenticated
with check (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer']::public.app_role[])
);

create policy shipments_update
on public.shipments
for update
to authenticated
using (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer']::public.app_role[])
)
with check (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer']::public.app_role[])
);

create policy shipments_delete
on public.shipments
for delete
to authenticated
using (public.has_any_role(array['admin']::public.app_role[]));

create policy shipment_line_items_read
on public.shipment_line_items
for select
to authenticated
using (true);

create policy shipment_line_items_insert
on public.shipment_line_items
for insert
to authenticated
with check (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer']::public.app_role[])
);

create policy shipment_line_items_update
on public.shipment_line_items
for update
to authenticated
using (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer']::public.app_role[])
)
with check (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer']::public.app_role[])
);

create policy shipment_line_items_delete
on public.shipment_line_items
for delete
to authenticated
using (public.has_any_role(array['admin', 'operations_manager']::public.app_role[]));

create policy ancillary_costs_read
on public.ancillary_costs
for select
to authenticated
using (true);

create policy ancillary_costs_insert
on public.ancillary_costs
for insert
to authenticated
with check (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer']::public.app_role[])
);

create policy ancillary_costs_update
on public.ancillary_costs
for update
to authenticated
using (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer']::public.app_role[])
)
with check (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer']::public.app_role[])
);

create policy ancillary_costs_delete
on public.ancillary_costs
for delete
to authenticated
using (public.has_any_role(array['admin', 'operations_manager']::public.app_role[]));

create policy sales_read
on public.sales
for select
to authenticated
using (true);

create policy sales_insert
on public.sales
for insert
to authenticated
with check (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer']::public.app_role[])
);

create policy sales_update
on public.sales
for update
to authenticated
using (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer', 'accounts']::public.app_role[])
)
with check (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer', 'accounts']::public.app_role[])
);

create policy sales_delete
on public.sales
for delete
to authenticated
using (public.has_any_role(array['admin', 'operations_manager']::public.app_role[]));

create policy mortality_records_read
on public.mortality_records
for select
to authenticated
using (true);

create policy mortality_records_insert
on public.mortality_records
for insert
to authenticated
with check (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer']::public.app_role[])
);

create policy mortality_records_update
on public.mortality_records
for update
to authenticated
using (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer']::public.app_role[])
)
with check (
  public.has_any_role(array['admin', 'operations_manager', 'procurement_officer']::public.app_role[])
);

create policy mortality_records_delete
on public.mortality_records
for delete
to authenticated
using (public.has_any_role(array['admin', 'operations_manager']::public.app_role[]));

create policy ap_transactions_read
on public.ap_transactions
for select
to authenticated
using (true);

create policy ap_transactions_insert
on public.ap_transactions
for insert
to authenticated
with check (
  public.has_any_role(array['admin', 'accounts']::public.app_role[])
);

create policy ap_transactions_update
on public.ap_transactions
for update
to authenticated
using (public.has_any_role(array['admin', 'accounts']::public.app_role[]))
with check (public.has_any_role(array['admin', 'accounts']::public.app_role[]));

create policy ap_transactions_delete
on public.ap_transactions
for delete
to authenticated
using (public.has_any_role(array['admin']::public.app_role[]));

create policy ap_payments_read
on public.ap_payments
for select
to authenticated
using (true);

create policy ap_payments_insert
on public.ap_payments
for insert
to authenticated
with check (
  public.has_any_role(array['admin', 'accounts']::public.app_role[])
);

create policy ap_payments_update
on public.ap_payments
for update
to authenticated
using (public.has_any_role(array['admin', 'accounts']::public.app_role[]))
with check (public.has_any_role(array['admin', 'accounts']::public.app_role[]));

create policy ap_payments_delete
on public.ap_payments
for delete
to authenticated
using (public.has_any_role(array['admin']::public.app_role[]));

create policy ap_payment_allocations_read
on public.ap_payment_allocations
for select
to authenticated
using (true);

create policy ap_payment_allocations_insert
on public.ap_payment_allocations
for insert
to authenticated
with check (
  public.has_any_role(array['admin', 'accounts']::public.app_role[])
);

create policy ap_payment_allocations_update
on public.ap_payment_allocations
for update
to authenticated
using (public.has_any_role(array['admin', 'accounts']::public.app_role[]))
with check (public.has_any_role(array['admin', 'accounts']::public.app_role[]));

create policy ap_payment_allocations_delete
on public.ap_payment_allocations
for delete
to authenticated
using (public.has_any_role(array['admin']::public.app_role[]));

create or replace view public.shipment_financial_summary as
with line_totals as (
  select
    shipment_id,
    coalesce(sum(total_jpy), 0)::numeric as total_jpy
  from public.shipment_line_items
  group by shipment_id
),
ancillary_totals as (
  select
    shipment_id,
    coalesce(sum(amount_krw), 0)::numeric as ancillary_krw
  from public.ancillary_costs
  group by shipment_id
),
sales_totals as (
  select
    shipment_id,
    coalesce(sum(total_krw), 0)::numeric as sales_krw
  from public.sales
  where shipment_id is not null
  group by shipment_id
)
select
  sh.id as shipment_id,
  sh.shipment_number,
  sh.status,
  sh.intake_date,
  sh.customs_date,
  sh.fx_rate,
  coalesce(lt.total_jpy, 0) as total_jpy,
  (coalesce(lt.total_jpy, 0) * coalesce(sh.fx_rate, 0))::numeric(18, 2) as purchase_krw,
  coalesce(at.ancillary_krw, 0)::numeric(18, 2) as ancillary_krw,
  (
    (coalesce(lt.total_jpy, 0) * coalesce(sh.fx_rate, 0))
    + coalesce(at.ancillary_krw, 0)
  )::numeric(18, 2) as total_cost_krw,
  coalesce(st.sales_krw, 0)::numeric(18, 2) as sales_krw,
  (
    coalesce(st.sales_krw, 0)
    - (
      (coalesce(lt.total_jpy, 0) * coalesce(sh.fx_rate, 0))
      + coalesce(at.ancillary_krw, 0)
    )
  )::numeric(18, 2) as net_profit_krw,
  case
    when coalesce(st.sales_krw, 0) = 0 then null
    else round(
      (
        (
          coalesce(st.sales_krw, 0)
          - (
            (coalesce(lt.total_jpy, 0) * coalesce(sh.fx_rate, 0))
            + coalesce(at.ancillary_krw, 0)
          )
        )
        / coalesce(st.sales_krw, 0)
      ) * 100,
      2
    )
  end as net_margin_pct
from public.shipments sh
left join line_totals lt on lt.shipment_id = sh.id
left join ancillary_totals at on at.shipment_id = sh.id
left join sales_totals st on st.shipment_id = sh.id;
