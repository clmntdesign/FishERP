drop view if exists public.historical_promotion_run_summary;

alter table public.historical_promotion_runs
alter column status drop default;

alter table public.historical_promotion_runs
alter column status type text using status::text;

alter table public.historical_promotion_runs
alter column status set default 'pending';

do $$
begin
  alter table public.historical_promotion_runs
  drop constraint if exists historical_promotion_runs_status_check;

  alter table public.historical_promotion_runs
  add constraint historical_promotion_runs_status_check
  check (status in ('pending', 'completed', 'failed'));
exception
  when duplicate_object then null;
end;
$$;

do $$
begin
  drop type if exists public.historical_promotion_status;
exception
  when dependent_objects_still_exist then null;
end;
$$;

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
