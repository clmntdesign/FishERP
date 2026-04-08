do $$
begin
  create type public.historical_import_status as enum ('pending', 'completed', 'failed');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.historical_row_status as enum ('parsed', 'quarantined', 'ignored');
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  create type public.historical_entity_status as enum ('ready', 'quarantined', 'ignored');
exception
  when duplicate_object then null;
end;
$$;

create table if not exists public.historical_import_runs (
  id uuid primary key default gen_random_uuid(),
  mode text not null default 'dry_run' check (mode in ('dry_run', 'append')),
  source_import_workbook text not null,
  source_ap_workbook text not null,
  default_year integer not null default 2023 check (default_year between 2000 and 2100),
  status public.historical_import_status not null default 'pending',
  notes text,
  imported_row_count integer not null default 0,
  parsed_entity_count integer not null default 0,
  quarantined_row_count integer not null default 0,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.historical_import_rows (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.historical_import_runs (id) on delete cascade,
  workbook_type text not null check (workbook_type in ('import', 'ap')),
  sheet_name text not null,
  row_number integer not null,
  section text not null default 'unknown',
  source_key text not null,
  row_status public.historical_row_status not null default 'parsed',
  raw_cells jsonb not null,
  parsed_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (run_id, workbook_type, sheet_name, row_number),
  unique (run_id, source_key)
);

create table if not exists public.historical_import_entities (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.historical_import_runs (id) on delete cascade,
  workbook_type text not null check (workbook_type in ('import', 'ap')),
  sheet_name text not null,
  row_number integer,
  entity_type text not null check (
    entity_type in ('shipment', 'shipment_line_item', 'ancillary_cost', 'sale', 'ap_transaction')
  ),
  source_key text not null,
  entity_status public.historical_entity_status not null default 'ready',
  payload jsonb not null,
  created_at timestamptz not null default now(),
  unique (run_id, entity_type, source_key)
);

create table if not exists public.historical_import_quarantine (
  id bigint generated always as identity primary key,
  run_id uuid not null references public.historical_import_runs (id) on delete cascade,
  workbook_type text not null check (workbook_type in ('import', 'ap')),
  sheet_name text not null,
  row_number integer,
  source_key text not null,
  issue_code text not null,
  severity text not null check (severity in ('warning', 'error')),
  message text not null,
  raw_cells jsonb not null default '[]'::jsonb,
  parsed_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_historical_import_rows_run_id
on public.historical_import_rows (run_id, workbook_type, sheet_name, row_number);

create index if not exists idx_historical_import_entities_run_id
on public.historical_import_entities (run_id, entity_type, entity_status);

create index if not exists idx_historical_import_quarantine_run_id
on public.historical_import_quarantine (run_id, severity, issue_code);

create or replace view public.historical_import_run_summary as
select
  r.id as run_id,
  r.mode,
  r.status,
  r.source_import_workbook,
  r.source_ap_workbook,
  r.default_year,
  r.imported_row_count,
  r.parsed_entity_count,
  r.quarantined_row_count,
  r.created_at,
  r.completed_at,
  coalesce(sum(case when q.severity = 'error' then 1 else 0 end), 0)::integer as error_count,
  coalesce(sum(case when q.severity = 'warning' then 1 else 0 end), 0)::integer as warning_count
from public.historical_import_runs r
left join public.historical_import_quarantine q on q.run_id = r.id
group by
  r.id,
  r.mode,
  r.status,
  r.source_import_workbook,
  r.source_ap_workbook,
  r.default_year,
  r.imported_row_count,
  r.parsed_entity_count,
  r.quarantined_row_count,
  r.created_at,
  r.completed_at;

create or replace view public.historical_import_quarantine_summary as
select
  q.run_id,
  q.workbook_type,
  q.issue_code,
  q.severity,
  count(*)::integer as issue_count
from public.historical_import_quarantine q
group by q.run_id, q.workbook_type, q.issue_code, q.severity;

alter table public.historical_import_runs enable row level security;
alter table public.historical_import_rows enable row level security;
alter table public.historical_import_entities enable row level security;
alter table public.historical_import_quarantine enable row level security;

drop policy if exists historical_import_runs_rw on public.historical_import_runs;
create policy historical_import_runs_rw
on public.historical_import_runs
for all
to authenticated
using (
  public.has_any_role(array['admin', 'operations_manager', 'accounts']::public.app_role[])
)
with check (
  public.has_any_role(array['admin', 'operations_manager', 'accounts']::public.app_role[])
);

drop policy if exists historical_import_rows_rw on public.historical_import_rows;
create policy historical_import_rows_rw
on public.historical_import_rows
for all
to authenticated
using (
  public.has_any_role(array['admin', 'operations_manager', 'accounts']::public.app_role[])
)
with check (
  public.has_any_role(array['admin', 'operations_manager', 'accounts']::public.app_role[])
);

drop policy if exists historical_import_entities_rw on public.historical_import_entities;
create policy historical_import_entities_rw
on public.historical_import_entities
for all
to authenticated
using (
  public.has_any_role(array['admin', 'operations_manager', 'accounts']::public.app_role[])
)
with check (
  public.has_any_role(array['admin', 'operations_manager', 'accounts']::public.app_role[])
);

drop policy if exists historical_import_quarantine_rw on public.historical_import_quarantine;
create policy historical_import_quarantine_rw
on public.historical_import_quarantine
for all
to authenticated
using (
  public.has_any_role(array['admin', 'operations_manager', 'accounts']::public.app_role[])
)
with check (
  public.has_any_role(array['admin', 'operations_manager', 'accounts']::public.app_role[])
);
