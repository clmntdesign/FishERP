alter table public.historical_import_entities
drop constraint if exists historical_import_entities_entity_type_check;

alter table public.historical_import_entities
add constraint historical_import_entities_entity_type_check
check (
  entity_type in (
    'shipment',
    'shipment_line_item',
    'ancillary_cost',
    'sale',
    'ap_transaction',
    'receivable_adjustment'
  )
);

do $$
begin
  create type public.historical_promotion_status as enum ('pending', 'completed', 'failed');
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.historical_promotion_runs (
  id uuid primary key default gen_random_uuid(),
  import_run_id uuid not null references public.historical_import_runs (id) on delete cascade,
  mode text not null check (mode in ('pilot', 'full')),
  max_shipments integer,
  status public.historical_promotion_status not null default 'pending',
  promoted_entity_count integer not null default 0,
  skipped_entity_count integer not null default 0,
  manual_review_count integer not null default 0,
  error_count integer not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.historical_promotion_links (
  id bigint generated always as identity primary key,
  promotion_run_id uuid not null references public.historical_promotion_runs (id) on delete cascade,
  import_entity_id bigint not null references public.historical_import_entities (id) on delete cascade,
  source_key text not null,
  target_table text not null,
  target_id uuid,
  action text not null check (action in ('inserted', 'skipped_existing', 'manual_review', 'error')),
  message text,
  created_at timestamptz not null default now(),
  unique (promotion_run_id, import_entity_id),
  unique (target_table, source_key)
);

create index if not exists idx_historical_promotion_runs_import_run
on public.historical_promotion_runs (import_run_id, created_at desc);

create index if not exists idx_historical_promotion_links_promotion_run
on public.historical_promotion_links (promotion_run_id, action);

create or replace view public.historical_promotion_run_summary as
select
  r.id as promotion_run_id,
  r.import_run_id,
  r.mode,
  r.max_shipments,
  r.status,
  r.promoted_entity_count,
  r.skipped_entity_count,
  r.manual_review_count,
  r.error_count,
  r.notes,
  r.created_at,
  r.completed_at,
  coalesce(sum(case when l.action = 'inserted' then 1 else 0 end), 0)::integer as link_inserted_count,
  coalesce(sum(case when l.action = 'skipped_existing' then 1 else 0 end), 0)::integer as link_skipped_count,
  coalesce(sum(case when l.action = 'manual_review' then 1 else 0 end), 0)::integer as link_manual_count,
  coalesce(sum(case when l.action = 'error' then 1 else 0 end), 0)::integer as link_error_count
from public.historical_promotion_runs r
left join public.historical_promotion_links l on l.promotion_run_id = r.id
group by
  r.id,
  r.import_run_id,
  r.mode,
  r.max_shipments,
  r.status,
  r.promoted_entity_count,
  r.skipped_entity_count,
  r.manual_review_count,
  r.error_count,
  r.notes,
  r.created_at,
  r.completed_at;

create or replace view public.historical_import_entity_sheet_summary as
select
  e.run_id,
  e.workbook_type,
  e.sheet_name,
  e.entity_type,
  count(*)::integer as entity_count
from public.historical_import_entities e
group by e.run_id, e.workbook_type, e.sheet_name, e.entity_type;

create or replace function public.promote_historical_import_run(
  p_import_run_id uuid,
  p_mode text default 'pilot',
  p_max_shipments integer default 3,
  p_notes text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_promotion_run_id uuid := gen_random_uuid();
  v_entity record;
  v_target_id uuid;
  v_target_table text;
  v_shipment_number text;
  v_shipment_id uuid;
  v_supplier_id uuid;
  v_species_id uuid;
  v_buyer_id uuid;
  v_selected_shipment_keys text[] := '{}'::text[];
  v_promoted_count integer := 0;
  v_skipped_count integer := 0;
  v_manual_count integer := 0;
  v_error_count integer := 0;
begin
  if p_import_run_id is null then
    raise exception 'import_run_id is required';
  end if;

  if p_mode not in ('pilot', 'full') then
    raise exception 'mode must be pilot or full';
  end if;

  if not exists (
    select 1
    from public.historical_import_runs r
    where r.id = p_import_run_id
  ) then
    raise exception 'historical import run % not found', p_import_run_id;
  end if;

  if p_mode = 'pilot' then
    select coalesce(array_agg(src.source_key), '{}'::text[])
    into v_selected_shipment_keys
    from (
      select e.source_key
      from public.historical_import_entities e
      where e.run_id = p_import_run_id
        and e.entity_status = 'ready'
        and e.entity_type = 'shipment'
      order by e.sheet_name
      limit greatest(coalesce(p_max_shipments, 3), 1)
    ) src;
  end if;

  insert into public.historical_promotion_runs (
    id,
    import_run_id,
    mode,
    max_shipments,
    status,
    notes
  )
  values (
    v_promotion_run_id,
    p_import_run_id,
    p_mode,
    case when p_mode = 'pilot' then greatest(coalesce(p_max_shipments, 3), 1) else null end,
    'pending',
    coalesce(p_notes, 'Historical staging promotion run')
  );

  insert into public.suppliers (code, name_kr, name_en, country_code, payment_terms_days)
  select distinct
    supplier_code,
    supplier_code,
    supplier_code,
    'JP',
    14
  from (
    select nullif(trim(e.payload ->> 'supplier_code'), '') as supplier_code
    from public.historical_import_entities e
    where e.run_id = p_import_run_id
      and e.entity_status = 'ready'
      and e.entity_type in ('shipment', 'ap_transaction')
  ) src
  where supplier_code is not null
  on conflict (code) do nothing;

  insert into public.species (code, name_kr, name_en, unit)
  select distinct
    species_code,
    coalesce(species_name_kr, species_code),
    coalesce(species_name_kr, species_code),
    'unit'
  from (
    select
      nullif(trim(e.payload ->> 'species_code'), '') as species_code,
      nullif(trim(e.payload ->> 'species_name_kr'), '') as species_name_kr
    from public.historical_import_entities e
    where e.run_id = p_import_run_id
      and e.entity_status = 'ready'
      and e.entity_type in ('shipment_line_item', 'sale')
  ) src
  where species_code is not null
  on conflict (code) do nothing;

  insert into public.buyers (code, name, payment_terms_days)
  select distinct
    buyer_code,
    coalesce(buyer_name, buyer_code),
    7
  from (
    select
      nullif(trim(e.payload ->> 'buyer_code'), '') as buyer_code,
      nullif(trim(e.payload ->> 'buyer_name'), '') as buyer_name
    from public.historical_import_entities e
    where e.run_id = p_import_run_id
      and e.entity_status = 'ready'
      and e.entity_type in ('sale', 'receivable_adjustment')
  ) src
  where buyer_code is not null
  on conflict (code) do nothing;

  for v_entity in
    select e.*
    from public.historical_import_entities e
    where e.run_id = p_import_run_id
      and e.entity_status = 'ready'
      and (
        p_mode = 'full'
        or (
          p_mode = 'pilot'
          and (
            (e.entity_type = 'shipment' and e.source_key = any(v_selected_shipment_keys))
            or (
              (e.payload ? 'shipment_source_key')
              and (e.payload ->> 'shipment_source_key') = any(v_selected_shipment_keys)
            )
          )
        )
      )
    order by
      case e.entity_type
        when 'shipment' then 1
        when 'shipment_line_item' then 2
        when 'ancillary_cost' then 3
        when 'sale' then 4
        when 'ap_transaction' then 5
        when 'receivable_adjustment' then 6
        else 99
      end,
      e.sheet_name,
      coalesce(e.row_number, 0),
      e.id
  loop
    begin
      if v_entity.entity_type = 'shipment' then
        v_target_table := 'shipments';
      elsif v_entity.entity_type = 'shipment_line_item' then
        v_target_table := 'shipment_line_items';
      elsif v_entity.entity_type = 'ancillary_cost' then
        v_target_table := 'ancillary_costs';
      elsif v_entity.entity_type = 'sale' then
        v_target_table := 'sales';
      elsif v_entity.entity_type = 'ap_transaction' then
        v_target_table := 'ap_transactions';
      else
        v_target_table := 'manual_review';
      end if;

      if exists (
        select 1
        from public.historical_promotion_links l
        where l.target_table = v_target_table
          and l.source_key = v_entity.source_key
      ) then
        insert into public.historical_promotion_links (
          promotion_run_id,
          import_entity_id,
          source_key,
          target_table,
          target_id,
          action,
          message
        )
        values (
          v_promotion_run_id,
          v_entity.id,
          v_entity.source_key,
          v_target_table,
          null,
          'skipped_existing',
          'Already promoted in previous run.'
        )
        on conflict (promotion_run_id, import_entity_id) do nothing;

        v_skipped_count := v_skipped_count + 1;
        continue;
      end if;

      v_target_id := null;
      v_shipment_id := null;

      if v_entity.entity_type = 'shipment' then
        select id into v_supplier_id
        from public.suppliers
        where code = (v_entity.payload ->> 'supplier_code')
        limit 1;

        if v_supplier_id is null then
          raise exception 'Supplier code not found: %', (v_entity.payload ->> 'supplier_code');
        end if;

        v_shipment_number := v_entity.payload ->> 'shipment_number';

        select id into v_target_id
        from public.shipments
        where shipment_number = v_shipment_number
        limit 1;

        if v_target_id is null then
          insert into public.shipments (
            shipment_number,
            supplier_id,
            intake_date,
            customs_date,
            status,
            fx_rate,
            notes
          )
          values (
            v_shipment_number,
            v_supplier_id,
            nullif(v_entity.payload ->> 'intake_date', '')::date,
            nullif(v_entity.payload ->> 'customs_date', '')::date,
            coalesce(nullif(v_entity.payload ->> 'status', '')::public.shipment_status, 'pending_customs'),
            nullif(v_entity.payload ->> 'fx_rate', '')::numeric,
            coalesce(nullif(v_entity.payload ->> 'notes', ''), 'Legacy promoted shipment')
          )
          returning id into v_target_id;

          insert into public.historical_promotion_links (
            promotion_run_id,
            import_entity_id,
            source_key,
            target_table,
            target_id,
            action,
            message
          )
          values (
            v_promotion_run_id,
            v_entity.id,
            v_entity.source_key,
            'shipments',
            v_target_id,
            'inserted',
            'Shipment inserted'
          );

          v_promoted_count := v_promoted_count + 1;
        else
          insert into public.historical_promotion_links (
            promotion_run_id,
            import_entity_id,
            source_key,
            target_table,
            target_id,
            action,
            message
          )
          values (
            v_promotion_run_id,
            v_entity.id,
            v_entity.source_key,
            'shipments',
            v_target_id,
            'skipped_existing',
            'Shipment already exists by shipment_number'
          );

          v_skipped_count := v_skipped_count + 1;
        end if;

      elsif v_entity.entity_type = 'shipment_line_item' then
        select se.payload ->> 'shipment_number'
        into v_shipment_number
        from public.historical_import_entities se
        where se.run_id = p_import_run_id
          and se.entity_type = 'shipment'
          and se.source_key = (v_entity.payload ->> 'shipment_source_key')
        limit 1;

        select id into v_shipment_id
        from public.shipments
        where shipment_number = v_shipment_number
        limit 1;

        select id into v_species_id
        from public.species
        where code = (v_entity.payload ->> 'species_code')
        limit 1;

        if v_shipment_id is null or v_species_id is null then
          insert into public.historical_promotion_links (
            promotion_run_id,
            import_entity_id,
            source_key,
            target_table,
            action,
            message
          )
          values (
            v_promotion_run_id,
            v_entity.id,
            v_entity.source_key,
            'shipment_line_items',
            'error',
            'Missing shipment or species reference'
          );
          v_error_count := v_error_count + 1;
          continue;
        end if;

        insert into public.shipment_line_items (
          shipment_id,
          species_id,
          quantity,
          unit_price_jpy,
          total_jpy,
          grade_code
        )
        values (
          v_shipment_id,
          v_species_id,
          nullif(v_entity.payload ->> 'quantity', '')::numeric,
          nullif(v_entity.payload ->> 'unit_price_jpy', '')::integer,
          nullif(v_entity.payload ->> 'total_jpy', '')::numeric,
          nullif(v_entity.payload ->> 'grade_code', '')
        )
        returning id into v_target_id;

        insert into public.historical_promotion_links (
          promotion_run_id,
          import_entity_id,
          source_key,
          target_table,
          target_id,
          action,
          message
        )
        values (
          v_promotion_run_id,
          v_entity.id,
          v_entity.source_key,
          'shipment_line_items',
          v_target_id,
          'inserted',
          'Shipment line item inserted'
        );

        v_promoted_count := v_promoted_count + 1;

      elsif v_entity.entity_type = 'ancillary_cost' then
        select se.payload ->> 'shipment_number'
        into v_shipment_number
        from public.historical_import_entities se
        where se.run_id = p_import_run_id
          and se.entity_type = 'shipment'
          and se.source_key = (v_entity.payload ->> 'shipment_source_key')
        limit 1;

        select id into v_shipment_id
        from public.shipments
        where shipment_number = v_shipment_number
        limit 1;

        if v_shipment_id is null then
          insert into public.historical_promotion_links (
            promotion_run_id,
            import_entity_id,
            source_key,
            target_table,
            action,
            message
          )
          values (
            v_promotion_run_id,
            v_entity.id,
            v_entity.source_key,
            'ancillary_costs',
            'error',
            'Missing shipment reference'
          );
          v_error_count := v_error_count + 1;
          continue;
        end if;

        insert into public.ancillary_costs (
          shipment_id,
          cost_type,
          amount_krw,
          cost_date,
          notes
        )
        values (
          v_shipment_id,
          nullif(v_entity.payload ->> 'cost_type', '')::public.ancillary_cost_type,
          nullif(v_entity.payload ->> 'amount_krw', '')::bigint,
          nullif(v_entity.payload ->> 'cost_date', '')::date,
          coalesce(
            nullif(v_entity.payload ->> 'notes', ''),
            'Legacy ancillary cost [' || v_entity.source_key || ']'
          )
        )
        returning id into v_target_id;

        insert into public.historical_promotion_links (
          promotion_run_id,
          import_entity_id,
          source_key,
          target_table,
          target_id,
          action,
          message
        )
        values (
          v_promotion_run_id,
          v_entity.id,
          v_entity.source_key,
          'ancillary_costs',
          v_target_id,
          'inserted',
          'Ancillary cost inserted'
        );

        v_promoted_count := v_promoted_count + 1;

      elsif v_entity.entity_type = 'sale' then
        select se.payload ->> 'shipment_number'
        into v_shipment_number
        from public.historical_import_entities se
        where se.run_id = p_import_run_id
          and se.entity_type = 'shipment'
          and se.source_key = (v_entity.payload ->> 'shipment_source_key')
        limit 1;

        select id into v_shipment_id
        from public.shipments
        where shipment_number = v_shipment_number
        limit 1;

        select id into v_species_id
        from public.species
        where code = (v_entity.payload ->> 'species_code')
        limit 1;

        select id into v_buyer_id
        from public.buyers
        where code = (v_entity.payload ->> 'buyer_code')
        limit 1;

        if v_shipment_id is null or v_species_id is null or v_buyer_id is null then
          insert into public.historical_promotion_links (
            promotion_run_id,
            import_entity_id,
            source_key,
            target_table,
            action,
            message
          )
          values (
            v_promotion_run_id,
            v_entity.id,
            v_entity.source_key,
            'sales',
            'error',
            'Missing shipment/species/buyer reference'
          );
          v_error_count := v_error_count + 1;
          continue;
        end if;

        insert into public.sales (
          shipment_id,
          buyer_id,
          dispatch_date,
          species_id,
          quantity,
          unit_price_krw,
          expected_payment_date,
          actual_payment_date,
          status,
          notes
        )
        values (
          v_shipment_id,
          v_buyer_id,
          nullif(v_entity.payload ->> 'dispatch_date', '')::date,
          v_species_id,
          nullif(v_entity.payload ->> 'quantity', '')::numeric,
          nullif(v_entity.payload ->> 'unit_price_krw', '')::bigint,
          nullif(v_entity.payload ->> 'expected_payment_date', '')::date,
          nullif(v_entity.payload ->> 'actual_payment_date', '')::date,
          coalesce(nullif(v_entity.payload ->> 'status', '')::public.sale_status, 'invoiced'),
          coalesce(
            nullif(v_entity.payload ->> 'notes', ''),
            'Legacy sale [' || v_entity.source_key || ']'
          )
        )
        returning id into v_target_id;

        insert into public.historical_promotion_links (
          promotion_run_id,
          import_entity_id,
          source_key,
          target_table,
          target_id,
          action,
          message
        )
        values (
          v_promotion_run_id,
          v_entity.id,
          v_entity.source_key,
          'sales',
          v_target_id,
          'inserted',
          'Sale inserted'
        );

        v_promoted_count := v_promoted_count + 1;

      elsif v_entity.entity_type = 'ap_transaction' then
        select id into v_supplier_id
        from public.suppliers
        where code = (v_entity.payload ->> 'supplier_code')
        limit 1;

        if (v_entity.payload ? 'shipment_source_key') then
          select se.payload ->> 'shipment_number'
          into v_shipment_number
          from public.historical_import_entities se
          where se.run_id = p_import_run_id
            and se.entity_type = 'shipment'
            and se.source_key = (v_entity.payload ->> 'shipment_source_key')
          limit 1;

          select id into v_shipment_id
          from public.shipments
          where shipment_number = v_shipment_number
          limit 1;
        else
          v_shipment_id := null;
        end if;

        if v_supplier_id is null then
          insert into public.historical_promotion_links (
            promotion_run_id,
            import_entity_id,
            source_key,
            target_table,
            action,
            message
          )
          values (
            v_promotion_run_id,
            v_entity.id,
            v_entity.source_key,
            'ap_transactions',
            'error',
            'Missing supplier reference'
          );
          v_error_count := v_error_count + 1;
          continue;
        end if;

        insert into public.ap_transactions (
          supplier_id,
          transaction_date,
          type,
          amount_krw,
          shipment_id,
          bank_reference,
          description
        )
        values (
          v_supplier_id,
          nullif(v_entity.payload ->> 'transaction_date', '')::date,
          nullif(v_entity.payload ->> 'type', '')::public.ap_transaction_type,
          nullif(v_entity.payload ->> 'amount_krw', '')::bigint,
          v_shipment_id,
          nullif(v_entity.payload ->> 'bank_reference', ''),
          coalesce(
            nullif(v_entity.payload ->> 'description', ''),
            'Legacy AP transaction [' || v_entity.source_key || ']'
          )
        )
        returning id into v_target_id;

        insert into public.historical_promotion_links (
          promotion_run_id,
          import_entity_id,
          source_key,
          target_table,
          target_id,
          action,
          message
        )
        values (
          v_promotion_run_id,
          v_entity.id,
          v_entity.source_key,
          'ap_transactions',
          v_target_id,
          'inserted',
          'AP transaction inserted'
        );

        v_promoted_count := v_promoted_count + 1;

      else
        insert into public.historical_promotion_links (
          promotion_run_id,
          import_entity_id,
          source_key,
          target_table,
          action,
          message
        )
        values (
          v_promotion_run_id,
          v_entity.id,
          v_entity.source_key,
          'manual_review',
          'manual_review',
          'Entity type requires manual review before production posting'
        );

        v_manual_count := v_manual_count + 1;
      end if;

    exception
      when others then
        insert into public.historical_promotion_links (
          promotion_run_id,
          import_entity_id,
          source_key,
          target_table,
          action,
          message
        )
        values (
          v_promotion_run_id,
          v_entity.id,
          v_entity.source_key,
          coalesce(v_target_table, 'unknown'),
          'error',
          left(sqlerrm, 900)
        )
        on conflict (promotion_run_id, import_entity_id) do nothing;

        v_error_count := v_error_count + 1;
    end;
  end loop;

  update public.historical_promotion_runs
  set
    promoted_entity_count = v_promoted_count,
    skipped_entity_count = v_skipped_count,
    manual_review_count = v_manual_count,
    error_count = v_error_count,
    status = case when v_error_count > 0 then 'failed' else 'completed' end,
    completed_at = now()
  where id = v_promotion_run_id;

  return v_promotion_run_id;
end;
$$;

grant execute on function public.promote_historical_import_run(
  uuid,
  text,
  integer,
  text
) to authenticated;

alter table public.historical_promotion_runs enable row level security;
alter table public.historical_promotion_links enable row level security;

drop policy if exists historical_promotion_runs_rw on public.historical_promotion_runs;
create policy historical_promotion_runs_rw
on public.historical_promotion_runs
for all
to authenticated
using (
  public.has_any_role(array['admin', 'operations_manager', 'accounts']::public.app_role[])
)
with check (
  public.has_any_role(array['admin', 'operations_manager', 'accounts']::public.app_role[])
);

drop policy if exists historical_promotion_links_rw on public.historical_promotion_links;
create policy historical_promotion_links_rw
on public.historical_promotion_links
for all
to authenticated
using (
  public.has_any_role(array['admin', 'operations_manager', 'accounts']::public.app_role[])
)
with check (
  public.has_any_role(array['admin', 'operations_manager', 'accounts']::public.app_role[])
);
