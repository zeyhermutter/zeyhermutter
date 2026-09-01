-- PREPARED ONLY. Do not apply until the Verkaufsfertig-Check backend has been
-- reviewed and explicitly approved for the target Supabase environment.

insert into public.permissions(key, description) values
  ('sales_readiness.read', 'Verkaufsfertig-Checks lesen'),
  ('sales_readiness.write', 'Verkaufsfertig-Checks und Maßnahmen bearbeiten'),
  ('sales_readiness.finalize', 'Verkaufsfertig-Checks finalisieren und revidieren')
on conflict (key) do update set description = excluded.description;

insert into public.role_permissions(role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'sales_readiness.read',
  'sales_readiness.write',
  'sales_readiness.finalize'
)
where r.key = 'managing_director'
on conflict do nothing;

create table public.lead_sales_readiness_checks (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete restrict,
  property_id uuid references public.properties(id) on delete restrict,
  previous_check_id uuid references public.lead_sales_readiness_checks(id) on delete restrict,
  revision_no integer not null default 1 check (revision_no > 0),
  is_current boolean not null default true,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'READY_FOR_REVIEW', 'FINALIZED')),
  inspection_at timestamptz,
  starting_situation text not null default '',
  sale_objective text not null default '',
  desired_timeframe text not null default '',
  overall_assessment text not null default '',
  assumptions_and_uncertainties text not null default '',
  responsible_user uuid not null references public.profiles(user_id) on delete restrict,
  finalized_at timestamptz,
  finalized_by uuid references public.profiles(user_id) on delete restrict,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles(user_id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references public.profiles(user_id) on delete restrict,
  version bigint not null default 1 check (version > 0),
  constraint lead_sales_readiness_checks_revision_unique unique (lead_id, revision_no),
  constraint lead_sales_readiness_checks_previous_check check (
    (revision_no = 1 and previous_check_id is null)
    or (revision_no > 1 and previous_check_id is not null)
  ),
  constraint lead_sales_readiness_checks_finalization check (
    (status = 'FINALIZED' and finalized_at is not null and finalized_by is not null)
    or (status <> 'FINALIZED' and finalized_at is null and finalized_by is null)
  )
);

create table public.lead_sales_readiness_scenarios (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.lead_sales_readiness_checks(id) on delete cascade,
  scenario_kind text not null check (scenario_kind in ('AS_IS', 'RECOMMENDED_PREPARATION', 'EXTENDED_MEASURES')),
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  assumptions text not null default '',
  confidence text not null default 'LOW' check (confidence in ('LOW', 'MEDIUM', 'HIGH')),
  investment_min numeric(14,2) check (investment_min is null or investment_min >= 0),
  investment_max numeric(14,2) check (investment_max is null or investment_max >= 0),
  estimated_sale_price_min numeric(14,2) check (estimated_sale_price_min is null or estimated_sale_price_min >= 0),
  estimated_sale_price_max numeric(14,2) check (estimated_sale_price_max is null or estimated_sale_price_max >= 0),
  duration_weeks_min integer check (duration_weeks_min is null or duration_weeks_min >= 0),
  duration_weeks_max integer check (duration_weeks_max is null or duration_weeks_max >= 0),
  is_recommended boolean not null default false,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles(user_id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references public.profiles(user_id) on delete restrict,
  version bigint not null default 1 check (version > 0),
  constraint lead_sales_readiness_scenarios_kind_unique unique (check_id, scenario_kind),
  constraint lead_sales_readiness_scenarios_investment_range check (
    investment_min is null or investment_max is null or investment_min <= investment_max
  ),
  constraint lead_sales_readiness_scenarios_price_range check (
    estimated_sale_price_min is null or estimated_sale_price_max is null or estimated_sale_price_min <= estimated_sale_price_max
  ),
  constraint lead_sales_readiness_scenarios_duration_range check (
    duration_weeks_min is null or duration_weeks_max is null or duration_weeks_min <= duration_weeks_max
  )
);

create table public.lead_sales_readiness_measures (
  id uuid primary key default gen_random_uuid(),
  check_id uuid not null references public.lead_sales_readiness_checks(id) on delete cascade,
  category text not null check (category in (
    'CLEARANCE_DISPOSAL', 'CLEANING', 'MINOR_REPAIRS', 'PAINTING',
    'FLOORING_PARQUET', 'GARDEN_EXTERIOR', 'FURNITURE_STYLING',
    'DOCUMENTS', 'ENERGY_CERTIFICATE', 'PHOTO_PREPARATION', 'OTHER'
  )),
  title text not null check (length(trim(title)) > 0),
  description text not null default '',
  decision text not null default 'OPEN' check (decision in ('RECOMMENDED', 'OPTIONAL', 'NOT_RECOMMENDED', 'OPEN')),
  rationale text not null default '',
  cost_min numeric(14,2) check (cost_min is null or cost_min >= 0),
  cost_max numeric(14,2) check (cost_max is null or cost_max >= 0),
  responsible_party text not null default '',
  responsible_user uuid references public.profiles(user_id) on delete restrict,
  partner_company text,
  target_date date,
  status text not null default 'OPEN' check (status in ('OPEN', 'PLANNED', 'COMMISSIONED', 'DONE', 'DISMISSED')),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() references public.profiles(user_id) on delete restrict,
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() references public.profiles(user_id) on delete restrict,
  version bigint not null default 1 check (version > 0),
  constraint lead_sales_readiness_measures_cost_range check (
    cost_min is null or cost_max is null or cost_min <= cost_max
  )
);

create unique index lead_sales_readiness_checks_current_idx
  on public.lead_sales_readiness_checks(lead_id)
  where is_current;
create index lead_sales_readiness_checks_property_idx
  on public.lead_sales_readiness_checks(property_id)
  where property_id is not null;
create index lead_sales_readiness_checks_previous_idx
  on public.lead_sales_readiness_checks(previous_check_id)
  where previous_check_id is not null;
create index lead_sales_readiness_checks_responsible_idx
  on public.lead_sales_readiness_checks(responsible_user, status)
  where is_current;
create index lead_sales_readiness_checks_finalized_by_idx
  on public.lead_sales_readiness_checks(finalized_by)
  where finalized_by is not null;
create index lead_sales_readiness_checks_created_by_idx
  on public.lead_sales_readiness_checks(created_by);
create index lead_sales_readiness_checks_updated_by_idx
  on public.lead_sales_readiness_checks(updated_by);
create unique index lead_sales_readiness_scenarios_recommended_idx
  on public.lead_sales_readiness_scenarios(check_id)
  where is_recommended;
create index lead_sales_readiness_scenarios_check_order_idx
  on public.lead_sales_readiness_scenarios(check_id, sort_order);
create index lead_sales_readiness_scenarios_created_by_idx
  on public.lead_sales_readiness_scenarios(created_by);
create index lead_sales_readiness_scenarios_updated_by_idx
  on public.lead_sales_readiness_scenarios(updated_by);
create index lead_sales_readiness_measures_check_order_idx
  on public.lead_sales_readiness_measures(check_id, sort_order);
create index lead_sales_readiness_measures_responsible_idx
  on public.lead_sales_readiness_measures(responsible_user, target_date)
  where responsible_user is not null and status in ('OPEN', 'PLANNED', 'COMMISSIONED');
create index lead_sales_readiness_measures_status_idx
  on public.lead_sales_readiness_measures(check_id, status);
create index lead_sales_readiness_measures_created_by_idx
  on public.lead_sales_readiness_measures(created_by);
create index lead_sales_readiness_measures_updated_by_idx
  on public.lead_sales_readiness_measures(updated_by);

create or replace function app_private.validate_sales_readiness_check()
returns trigger
language plpgsql
set search_path = public, app_private, pg_temp
as $$
declare
  v_converted_property_id uuid;
  v_scenario_count integer;
  v_recommended_count integer;
begin
  select l.converted_property_id into v_converted_property_id
  from public.leads l
  where l.id = new.lead_id;

  if not found then
    raise exception 'SALES_READINESS_LEAD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.property_id is not null and new.property_id is distinct from v_converted_property_id then
    raise exception 'SALES_READINESS_PROPERTY_MUST_MATCH_CONVERTED_LEAD_PROPERTY' using errcode = '23514';
  end if;

  if tg_op = 'INSERT' then
    if new.status <> 'DRAFT' or new.finalized_at is not null or new.finalized_by is not null then
      raise exception 'NEW_SALES_READINESS_CHECK_MUST_BE_DRAFT' using errcode = '23514';
    end if;
  else
    if old.id is distinct from new.id
       or old.lead_id is distinct from new.lead_id
       or old.revision_no is distinct from new.revision_no
       or old.previous_check_id is distinct from new.previous_check_id then
      raise exception 'SALES_READINESS_IDENTITY_IS_IMMUTABLE' using errcode = '23514';
    end if;

    if old.status = 'FINALIZED' then
      if current_setting('app.sales_readiness_revision', true) = '1'
         and old.is_current
         and not new.is_current
         and (to_jsonb(old) - array['is_current', 'updated_at', 'updated_by', 'version']) =
             (to_jsonb(new) - array['is_current', 'updated_at', 'updated_by', 'version']) then
        return new;
      end if;
      raise exception 'FINALIZED_SALES_READINESS_CHECK_IS_IMMUTABLE' using errcode = '23514';
    end if;

    if new.status = 'FINALIZED' then
      if current_setting('app.sales_readiness_finalization', true) <> '1' then
        raise exception 'USE_FINALIZE_SALES_READINESS_CHECK' using errcode = '42501';
      end if;
      select count(*), count(*) filter (where s.is_recommended)
        into v_scenario_count, v_recommended_count
      from public.lead_sales_readiness_scenarios s
      where s.check_id = new.id;
      if v_scenario_count <> 3 or v_recommended_count <> 1 then
        raise exception 'FINALIZATION_REQUIRES_THREE_SCENARIOS_AND_ONE_RECOMMENDATION' using errcode = '23514';
      end if;
      if nullif(trim(new.overall_assessment), '') is null
         or nullif(trim(new.assumptions_and_uncertainties), '') is null then
        raise exception 'FINALIZATION_REQUIRES_ASSESSMENT_AND_ASSUMPTIONS' using errcode = '23514';
      end if;
    elsif new.finalized_at is not null or new.finalized_by is not null then
      raise exception 'FINALIZATION_METADATA_IS_SYSTEM_MANAGED' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.validate_sales_readiness_check() from public, anon, authenticated;

create or replace function app_private.validate_sales_readiness_child_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_check_id uuid := coalesce(new.check_id, old.check_id);
begin
  if exists (
    select 1 from public.lead_sales_readiness_checks c
    where c.id = v_check_id and c.status = 'FINALIZED'
  ) then
    raise exception 'FINALIZED_SALES_READINESS_CHECK_IS_IMMUTABLE' using errcode = '23514';
  end if;
  if tg_op = 'UPDATE' and old.check_id is distinct from new.check_id then
    raise exception 'SALES_READINESS_PARENT_IS_IMMUTABLE' using errcode = '23514';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function app_private.validate_sales_readiness_child_write() from public, anon, authenticated;

create trigger lead_sales_readiness_checks_10_validate
before insert or update on public.lead_sales_readiness_checks
for each row execute function app_private.validate_sales_readiness_check();
create trigger lead_sales_readiness_checks_40_metadata
before update on public.lead_sales_readiness_checks
for each row execute function app_private.set_business_update_metadata();
create trigger lead_sales_readiness_checks_90_audit
after insert or update or delete on public.lead_sales_readiness_checks
for each row execute function app_private.audit_row_change('LEAD_SALES_READINESS_CHECK', 'revision_no');

create trigger lead_sales_readiness_scenarios_10_validate
before insert or update or delete on public.lead_sales_readiness_scenarios
for each row execute function app_private.validate_sales_readiness_child_write();
create trigger lead_sales_readiness_scenarios_40_metadata
before update on public.lead_sales_readiness_scenarios
for each row execute function app_private.set_business_update_metadata();
create trigger lead_sales_readiness_scenarios_90_audit
after insert or update or delete on public.lead_sales_readiness_scenarios
for each row execute function app_private.audit_row_change('LEAD_SALES_READINESS_SCENARIO', 'scenario_kind');

create trigger lead_sales_readiness_measures_10_validate
before insert or update or delete on public.lead_sales_readiness_measures
for each row execute function app_private.validate_sales_readiness_child_write();
create trigger lead_sales_readiness_measures_40_metadata
before update on public.lead_sales_readiness_measures
for each row execute function app_private.set_business_update_metadata();
create trigger lead_sales_readiness_measures_90_audit
after insert or update or delete on public.lead_sales_readiness_measures
for each row execute function app_private.audit_row_change('LEAD_SALES_READINESS_MEASURE', 'title');

alter table public.lead_sales_readiness_checks enable row level security;
alter table public.lead_sales_readiness_scenarios enable row level security;
alter table public.lead_sales_readiness_measures enable row level security;

create policy lead_sales_readiness_checks_select on public.lead_sales_readiness_checks
for select to authenticated
using (app_private.has_permission('sales_readiness.read'));
create policy lead_sales_readiness_checks_insert on public.lead_sales_readiness_checks
for insert to authenticated
with check (
  app_private.has_permission('sales_readiness.write')
  and created_by = auth.uid()
  and updated_by = auth.uid()
  and status = 'DRAFT'
);
create policy lead_sales_readiness_checks_update on public.lead_sales_readiness_checks
for update to authenticated
using (app_private.has_permission('sales_readiness.write') and status <> 'FINALIZED')
with check (app_private.has_permission('sales_readiness.write'));

create policy lead_sales_readiness_scenarios_select on public.lead_sales_readiness_scenarios
for select to authenticated
using (app_private.has_permission('sales_readiness.read'));
create policy lead_sales_readiness_scenarios_insert on public.lead_sales_readiness_scenarios
for insert to authenticated
with check (app_private.has_permission('sales_readiness.write') and created_by = auth.uid() and updated_by = auth.uid());
create policy lead_sales_readiness_scenarios_update on public.lead_sales_readiness_scenarios
for update to authenticated
using (app_private.has_permission('sales_readiness.write'))
with check (app_private.has_permission('sales_readiness.write'));
create policy lead_sales_readiness_scenarios_delete on public.lead_sales_readiness_scenarios
for delete to authenticated
using (app_private.has_permission('sales_readiness.write'));

create policy lead_sales_readiness_measures_select on public.lead_sales_readiness_measures
for select to authenticated
using (app_private.has_permission('sales_readiness.read'));
create policy lead_sales_readiness_measures_insert on public.lead_sales_readiness_measures
for insert to authenticated
with check (app_private.has_permission('sales_readiness.write') and created_by = auth.uid() and updated_by = auth.uid());
create policy lead_sales_readiness_measures_update on public.lead_sales_readiness_measures
for update to authenticated
using (app_private.has_permission('sales_readiness.write'))
with check (app_private.has_permission('sales_readiness.write'));
create policy lead_sales_readiness_measures_delete on public.lead_sales_readiness_measures
for delete to authenticated
using (app_private.has_permission('sales_readiness.write'));

revoke all privileges on table public.lead_sales_readiness_checks from anon, authenticated;
revoke all privileges on table public.lead_sales_readiness_scenarios from anon, authenticated;
revoke all privileges on table public.lead_sales_readiness_measures from anon, authenticated;
grant select, insert, update on table public.lead_sales_readiness_checks to authenticated;
grant select, insert, update, delete on table public.lead_sales_readiness_scenarios to authenticated;
grant select, insert, update, delete on table public.lead_sales_readiness_measures to authenticated;
grant select, insert, update, delete on table public.lead_sales_readiness_checks to service_role;
grant select, insert, update, delete on table public.lead_sales_readiness_scenarios to service_role;
grant select, insert, update, delete on table public.lead_sales_readiness_measures to service_role;

create or replace function public.finalize_lead_sales_readiness_check(
  p_check_id uuid,
  p_expected_version bigint
)
returns public.lead_sales_readiness_checks
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_result public.lead_sales_readiness_checks;
begin
  if v_user is null or not app_private.has_permission('sales_readiness.finalize') then
    raise exception 'SALES_READINESS_FINALIZE_REQUIRED' using errcode = '42501';
  end if;
  perform set_config('app.sales_readiness_finalization', '1', true);
  update public.lead_sales_readiness_checks
  set status = 'FINALIZED', finalized_at = now(), finalized_by = v_user
  where id = p_check_id and version = p_expected_version and is_current and status = 'READY_FOR_REVIEW'
  returning * into v_result;
  if not found then
    raise exception 'SALES_READINESS_CONFLICT_OR_INVALID_STATE' using errcode = '40001';
  end if;
  return v_result;
end;
$$;
revoke all on function public.finalize_lead_sales_readiness_check(uuid, bigint) from public, anon, authenticated;
grant execute on function public.finalize_lead_sales_readiness_check(uuid, bigint) to authenticated, service_role;

create or replace function public.create_lead_sales_readiness_revision(
  p_check_id uuid,
  p_expected_version bigint
)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_old public.lead_sales_readiness_checks;
  v_new_id uuid;
begin
  if v_user is null or not app_private.has_permission('sales_readiness.finalize') then
    raise exception 'SALES_READINESS_FINALIZE_REQUIRED' using errcode = '42501';
  end if;
  select * into v_old
  from public.lead_sales_readiness_checks
  where id = p_check_id and version = p_expected_version and is_current and status = 'FINALIZED'
  for update;
  if not found then
    raise exception 'SALES_READINESS_CONFLICT_OR_INVALID_STATE' using errcode = '40001';
  end if;

  perform set_config('app.sales_readiness_revision', '1', true);
  update public.lead_sales_readiness_checks set is_current = false where id = v_old.id;
  insert into public.lead_sales_readiness_checks(
    lead_id, property_id, previous_check_id, revision_no, is_current, status,
    inspection_at, starting_situation, sale_objective, desired_timeframe,
    overall_assessment, assumptions_and_uncertainties, responsible_user,
    created_by, updated_by
  ) values (
    v_old.lead_id, v_old.property_id, v_old.id, v_old.revision_no + 1, true, 'DRAFT',
    v_old.inspection_at, v_old.starting_situation, v_old.sale_objective, v_old.desired_timeframe,
    v_old.overall_assessment, v_old.assumptions_and_uncertainties, v_old.responsible_user,
    v_user, v_user
  ) returning id into v_new_id;

  insert into public.lead_sales_readiness_scenarios(
    check_id, scenario_kind, title, description, assumptions, confidence,
    investment_min, investment_max, estimated_sale_price_min, estimated_sale_price_max,
    duration_weeks_min, duration_weeks_max, is_recommended, sort_order, created_by, updated_by
  )
  select v_new_id, scenario_kind, title, description, assumptions, confidence,
    investment_min, investment_max, estimated_sale_price_min, estimated_sale_price_max,
    duration_weeks_min, duration_weeks_max, is_recommended, sort_order, v_user, v_user
  from public.lead_sales_readiness_scenarios where check_id = v_old.id;

  insert into public.lead_sales_readiness_measures(
    check_id, category, title, description, decision, rationale, cost_min, cost_max,
    responsible_party, responsible_user, partner_company, target_date, status, sort_order,
    created_by, updated_by
  )
  select v_new_id, category, title, description, decision, rationale, cost_min, cost_max,
    responsible_party, responsible_user, partner_company, target_date,
    case when status = 'DONE' then 'DONE' else 'OPEN' end, sort_order, v_user, v_user
  from public.lead_sales_readiness_measures where check_id = v_old.id;

  return v_new_id;
end;
$$;
revoke all on function public.create_lead_sales_readiness_revision(uuid, bigint) from public, anon, authenticated;
grant execute on function public.create_lead_sales_readiness_revision(uuid, bigint) to authenticated, service_role;

alter table public.tasks
  add column sales_readiness_measure_id uuid unique
  references public.lead_sales_readiness_measures(id) on delete restrict;

create or replace function public.create_tasks_from_sales_readiness_measures(
  p_check_id uuid,
  p_measure_ids uuid[],
  p_expected_check_version bigint
)
returns table(measure_id uuid, task_id uuid)
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_lead_id uuid;
  v_contact_id uuid;
  v_default_responsible uuid;
begin
  if v_user is null
     or not app_private.has_permission('sales_readiness.write')
     or not app_private.has_permission('task.write') then
    raise exception 'SALES_READINESS_AND_TASK_WRITE_REQUIRED' using errcode = '42501';
  end if;
  select c.lead_id, l.contact_id, c.responsible_user
    into v_lead_id, v_contact_id, v_default_responsible
  from public.lead_sales_readiness_checks c
  join public.leads l on l.id = c.lead_id
  where c.id = p_check_id
    and c.version = p_expected_check_version
    and c.is_current
    and c.status = 'FINALIZED';
  if not found then
    raise exception 'SALES_READINESS_CONFLICT_OR_NOT_FINALIZED' using errcode = '40001';
  end if;
  if p_measure_ids is null or cardinality(p_measure_ids) = 0 then
    raise exception 'AT_LEAST_ONE_MEASURE_REQUIRED' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(p_measure_ids) requested_id
    where not exists (
      select 1 from public.lead_sales_readiness_measures m
      where m.id = requested_id and m.check_id = p_check_id
        and m.decision in ('RECOMMENDED', 'OPTIONAL') and m.status <> 'DISMISSED'
    )
  ) then
    raise exception 'INVALID_SALES_READINESS_MEASURE_SELECTION' using errcode = '22023';
  end if;

  insert into public.tasks(
    title, description, status, priority, due_at, responsible_user,
    contact_id, lead_id, sales_readiness_measure_id, created_by, updated_by
  )
  select
    m.title,
    concat('Verkaufsfertig-Check · ', m.category, E'\n\n', nullif(m.description, ''),
      case when nullif(m.rationale, '') is not null then E'\n\nBegründung: ' || m.rationale else '' end),
    'OPEN', 'NORMAL',
    (coalesce(m.target_date, current_date + 14)::date + time '09:00') at time zone 'Europe/Berlin',
    coalesce(m.responsible_user, v_default_responsible),
    v_contact_id, v_lead_id, m.id, v_user, v_user
  from public.lead_sales_readiness_measures m
  where m.check_id = p_check_id and m.id = any(p_measure_ids)
  on conflict (sales_readiness_measure_id) do nothing;

  return query
  select m.id, t.id
  from public.lead_sales_readiness_measures m
  join public.tasks t on t.sales_readiness_measure_id = m.id
  where m.check_id = p_check_id and m.id = any(p_measure_ids)
  order by m.sort_order, m.id;
end;
$$;
revoke all on function public.create_tasks_from_sales_readiness_measures(uuid, uuid[], bigint) from public, anon;
grant execute on function public.create_tasks_from_sales_readiness_measures(uuid, uuid[], bigint) to authenticated, service_role;

-- Future public SELLER_CHECK intake support. The Edge Function remains gated,
-- and this migration is not applied yet.
alter table public.leads
  add column website_submission_key text,
  add column public_source_url text;
alter table public.leads
  add constraint leads_website_submission_key_length check (
    website_submission_key is null or length(website_submission_key) between 16 and 80
  ),
  add constraint leads_public_source_url_length check (
    public_source_url is null or length(public_source_url) <= 500
  );
create unique index leads_website_submission_key_unique
  on public.leads(website_submission_key)
  where website_submission_key is not null;

create or replace function app_private.enforce_lead_sensitive_permissions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    if auth.role() = 'service_role'
       and current_setting('app.website_seller_check_intake', true) = '1' then
      return new;
    end if;
    if new.primary_responsible_user is distinct from auth.uid()
       and not app_private.has_permission('lead.assign') then
      raise exception 'missing lead.assign permission';
    end if;
    return new;
  end if;

  if old.primary_responsible_user is distinct from new.primary_responsible_user
     and not app_private.has_permission('lead.assign') then
    raise exception 'missing lead.assign permission';
  end if;
  if old.archived_at is distinct from new.archived_at
     and not app_private.has_permission('lead.archive') then
    raise exception 'missing lead.archive permission';
  end if;
  if old.converted_property_id is distinct from new.converted_property_id
     or old.converted_at is distinct from new.converted_at
     or old.converted_by is distinct from new.converted_by then
    if current_setting('app.lead_conversion', true) <> '1'
       or not app_private.has_permission('lead.convert') then
      raise exception 'lead conversion metadata is managed by the conversion workflow';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_lead_sensitive_permissions() from public, anon, authenticated;

create or replace function public.create_public_seller_check_lead(
  p_contact_id uuid,
  p_responsible_user uuid,
  p_submission_key text,
  p_source_url text,
  p_message text,
  p_property_postal_code text,
  p_property_city text,
  p_property_type text,
  p_property_condition text,
  p_desired_sale_horizon text,
  p_consent_text_version text
)
returns table(out_lead_id uuid, out_lead_number text, out_deduplicated boolean)
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
declare
  v_source_id uuid;
begin
  if auth.role() <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_contact_id is null
     or p_responsible_user is null
     or length(trim(coalesce(p_submission_key, ''))) < 16
     or nullif(trim(coalesce(p_message, '')), '') is null
     or nullif(trim(coalesce(p_consent_text_version, '')), '') is null then
    raise exception 'INVALID_SELLER_CHECK_INTAKE' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.profiles p
    where p.user_id = p_responsible_user and p.status = 'ACTIVE'
  ) then
    raise exception 'RESPONSIBLE_USER_NOT_ACTIVE' using errcode = '22023';
  end if;
  return query
  select l.id, l.lead_number, true
  from public.leads l where l.website_submission_key = p_submission_key;
  if found then return; end if;

  select id into v_source_id from public.lead_sources where key = 'WEBSITE' and active;
  if v_source_id is null then
    raise exception 'WEBSITE_LEAD_SOURCE_NOT_AVAILABLE' using errcode = 'P0002';
  end if;
  perform set_config('app.website_seller_check_intake', '1', true);
  return query
  insert into public.leads(
    contact_id, status, source_id, source_detail, primary_responsible_user,
    property_postal_code, property_city, property_type, property_condition,
    desired_sale_horizon, message, consent_given, consent_at,
    consent_text_version, website_submission_key, public_source_url,
    created_by, updated_by
  ) values (
    p_contact_id, 'NEW', v_source_id, 'Verkaufsfertig-Check · Website', p_responsible_user,
    nullif(trim(p_property_postal_code), ''), nullif(trim(p_property_city), ''),
    nullif(trim(p_property_type), ''), nullif(trim(p_property_condition), ''),
    nullif(trim(p_desired_sale_horizon), ''), trim(p_message), true, now(),
    p_consent_text_version, trim(p_submission_key), nullif(trim(p_source_url), ''),
    null, null
  )
  returning id, lead_number, false;
exception
  when unique_violation then
    return query
    select l.id, l.lead_number, true
    from public.leads l where l.website_submission_key = p_submission_key;
end;
$$;
revoke all on function public.create_public_seller_check_lead(uuid, uuid, text, text, text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.create_public_seller_check_lead(uuid, uuid, text, text, text, text, text, text, text, text, text) to service_role;

comment on table public.lead_sales_readiness_checks is 'Versionierte, leadgebundene Verkaufsfertig-Checks. Finalisierte Revisionen sind unveränderlich.';
comment on table public.lead_sales_readiness_scenarios is 'Drei vergleichbare Szenarien je Verkaufsfertig-Check; genau eines ist bei Finalisierung empfohlen.';
comment on table public.lead_sales_readiness_measures is 'Priorisierte Maßnahmen eines Verkaufsfertig-Checks mit Kostenkorridor, Verantwortlichkeit und Zieltermin.';
comment on function public.create_tasks_from_sales_readiness_measures(uuid, uuid[], bigint) is 'Erzeugt je Maßnahme höchstens eine CRM-Aufgabe; atomar und wiederholbar.';
