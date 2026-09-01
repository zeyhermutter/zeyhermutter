-- Complete the BETA sales-readiness business rules and make all editor writes
-- check-version-aware. This migration is additive/hardening only.

create or replace function app_private.set_sales_readiness_update_metadata()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.created_at := old.created_at;
  new.created_by := old.created_by;
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.version := old.version + 1;
  return new;
end;
$$;

revoke all on function app_private.set_sales_readiness_update_metadata() from public, anon;
grant execute on function app_private.set_sales_readiness_update_metadata() to authenticated, service_role;

drop trigger if exists lead_sales_readiness_checks_40_metadata on public.lead_sales_readiness_checks;
create trigger lead_sales_readiness_checks_40_metadata
before update on public.lead_sales_readiness_checks
for each row execute function app_private.set_sales_readiness_update_metadata();

drop trigger if exists lead_sales_readiness_scenarios_40_metadata on public.lead_sales_readiness_scenarios;
create trigger lead_sales_readiness_scenarios_40_metadata
before update on public.lead_sales_readiness_scenarios
for each row execute function app_private.set_sales_readiness_update_metadata();

drop trigger if exists lead_sales_readiness_measures_40_metadata on public.lead_sales_readiness_measures;
create trigger lead_sales_readiness_measures_40_metadata
before update on public.lead_sales_readiness_measures
for each row execute function app_private.set_sales_readiness_update_metadata();

alter table public.lead_sales_readiness_checks
  add column if not exists owner_decision text not null default 'OPEN',
  add column if not exists owner_decision_at date,
  add column if not exists owner_decision_by text not null default '',
  add column if not exists owner_decision_note text not null default '';

alter table public.lead_sales_readiness_checks
  drop constraint if exists lead_sales_readiness_checks_owner_decision_check;
alter table public.lead_sales_readiness_checks
  add constraint lead_sales_readiness_checks_owner_decision_check
  check (owner_decision in (
    'OPEN',
    'AS_IS_SALE',
    'RECOMMENDED_PREPARATION',
    'EXTENDED_RENOVATION',
    'INDIVIDUAL_MEASURES',
    'POSTPONED',
    'NO_SALE'
  ));

alter table public.lead_sales_readiness_checks
  drop constraint if exists lead_sales_readiness_checks_owner_decision_metadata;
alter table public.lead_sales_readiness_checks
  add constraint lead_sales_readiness_checks_owner_decision_metadata
  check (
    (owner_decision = 'OPEN' and owner_decision_at is null and length(btrim(owner_decision_by)) = 0)
    or
    (owner_decision <> 'OPEN' and owner_decision_at is not null and length(btrim(owner_decision_by)) > 0)
  );

alter table public.lead_sales_readiness_scenarios
  add column if not exists internal_assessment text not null default '',
  add column if not exists recommendation_rationale text not null default '';

create unique index if not exists lead_sales_readiness_one_recommendation_idx
  on public.lead_sales_readiness_scenarios(check_id)
  where is_recommended;

alter table public.lead_sales_readiness_measures
  add column if not exists quote_price numeric,
  add column if not exists approved_budget numeric,
  add column if not exists actual_cost numeric,
  add column if not exists owner_approval_status text not null default 'NOT_REQUESTED',
  add column if not exists owner_approval_at date,
  add column if not exists planned_start_date date,
  add column if not exists planned_end_date date,
  add column if not exists completed_at date;

alter table public.lead_sales_readiness_measures
  drop constraint if exists lead_sales_readiness_measures_status_check;

update public.lead_sales_readiness_measures
set status = case status
  when 'OPEN' then 'PROPOSED'
  else status
end
where status = 'OPEN';

alter table public.lead_sales_readiness_measures
  add constraint lead_sales_readiness_measures_status_check
  check (status in (
    'PROPOSED',
    'QUOTE_REQUIRED',
    'QUOTE_REQUESTED',
    'QUOTE_RECEIVED',
    'WAITING_OWNER',
    'APPROVED',
    'COMMISSIONED',
    'PLANNED',
    'IN_PROGRESS',
    'BLOCKED',
    'DONE',
    'CHECKED',
    'DISMISSED'
  ));

alter table public.lead_sales_readiness_measures
  drop constraint if exists lead_sales_readiness_measures_owner_approval_check;
alter table public.lead_sales_readiness_measures
  add constraint lead_sales_readiness_measures_owner_approval_check
  check (owner_approval_status in (
    'NOT_REQUESTED',
    'PENDING',
    'APPROVED',
    'REJECTED',
    'NOT_REQUIRED'
  ));

alter table public.lead_sales_readiness_measures
  drop constraint if exists lead_sales_readiness_measures_quote_price_check;
alter table public.lead_sales_readiness_measures
  add constraint lead_sales_readiness_measures_quote_price_check
  check (quote_price is null or quote_price >= 0);

alter table public.lead_sales_readiness_measures
  drop constraint if exists lead_sales_readiness_measures_approved_budget_check;
alter table public.lead_sales_readiness_measures
  add constraint lead_sales_readiness_measures_approved_budget_check
  check (approved_budget is null or approved_budget >= 0);

alter table public.lead_sales_readiness_measures
  drop constraint if exists lead_sales_readiness_measures_actual_cost_check;
alter table public.lead_sales_readiness_measures
  add constraint lead_sales_readiness_measures_actual_cost_check
  check (actual_cost is null or actual_cost >= 0);

alter table public.lead_sales_readiness_measures
  drop constraint if exists lead_sales_readiness_measures_planned_date_range;
alter table public.lead_sales_readiness_measures
  add constraint lead_sales_readiness_measures_planned_date_range
  check (
    planned_start_date is null
    or planned_end_date is null
    or planned_start_date <= planned_end_date
  );

create or replace function app_private.validate_sales_readiness_check()
returns trigger
language plpgsql
set search_path = public, app_private, pg_temp
as $$
declare
  v_converted_property_id uuid;
  v_scenario_count integer;
  v_recommended_count integer;
  v_complete_scenario_count integer;
  v_open_measure_count integer;
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

  if new.owner_decision = 'OPEN' then
    if new.owner_decision_at is not null or length(btrim(new.owner_decision_by)) > 0 then
      raise exception 'OPEN_OWNER_DECISION_MUST_NOT_HAVE_DECISION_METADATA' using errcode = '23514';
    end if;
  elsif new.owner_decision_at is null or length(btrim(new.owner_decision_by)) = 0 then
    raise exception 'OWNER_DECISION_REQUIRES_DATE_AND_DECIDER' using errcode = '23514';
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

    if old.status <> 'READY_FOR_REVIEW'
       and new.status = 'READY_FOR_REVIEW'
       and current_setting('app.sales_readiness_review', true) <> '1' then
      raise exception 'USE_MARK_SALES_READINESS_READY' using errcode = '42501';
    end if;

    if new.status = 'FINALIZED' then
      if current_setting('app.sales_readiness_finalization', true) <> '1' then
        raise exception 'USE_FINALIZE_SALES_READINESS_CHECK' using errcode = '42501';
      end if;

      select
        count(*),
        count(*) filter (where s.is_recommended),
        count(*) filter (
          where length(btrim(s.title)) > 0
            and length(btrim(s.description)) > 0
            and length(btrim(s.assumptions)) > 0
            and length(btrim(s.internal_assessment)) > 0
            and s.estimated_sale_price_min is not null
            and s.estimated_sale_price_max is not null
            and s.duration_weeks_min is not null
            and s.duration_weeks_max is not null
            and (
              s.scenario_kind = 'AS_IS'
              or (s.investment_min is not null and s.investment_max is not null)
            )
            and (
              not s.is_recommended
              or length(btrim(s.recommendation_rationale)) > 0
            )
        )
      into v_scenario_count, v_recommended_count, v_complete_scenario_count
      from public.lead_sales_readiness_scenarios s
      where s.check_id = new.id;

      select count(*) into v_open_measure_count
      from public.lead_sales_readiness_measures m
      where m.check_id = new.id and m.decision = 'OPEN';

      if v_scenario_count <> 3 or v_recommended_count <> 1 or v_complete_scenario_count <> 3 then
        raise exception 'FINALIZATION_REQUIRES_COMPLETE_SCENARIOS' using errcode = '23514';
      end if;

      if v_open_measure_count > 0 then
        raise exception 'FINALIZATION_REQUIRES_DECIDED_MEASURES' using errcode = '23514';
      end if;

      if new.inspection_at is null
         or nullif(trim(new.starting_situation), '') is null
         or nullif(trim(new.sale_objective), '') is null
         or nullif(trim(new.overall_assessment), '') is null
         or nullif(trim(new.assumptions_and_uncertainties), '') is null then
        raise exception 'FINALIZATION_REQUIRES_COMPLETE_CHECK_BASICS' using errcode = '23514';
      end if;

      if new.owner_decision = 'OPEN' then
        raise exception 'FINALIZATION_REQUIRES_OWNER_DECISION' using errcode = '23514';
      end if;
    elsif new.finalized_at is not null or new.finalized_by is not null then
      raise exception 'FINALIZATION_METADATA_IS_SYSTEM_MANAGED' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.save_lead_sales_readiness_check(
  p_lead_id uuid,
  p_check_id uuid,
  p_expected_version bigint,
  p_inspection_at timestamptz,
  p_starting_situation text,
  p_sale_objective text,
  p_desired_timeframe text,
  p_overall_assessment text,
  p_assumptions_and_uncertainties text
)
returns public.lead_sales_readiness_checks
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_result public.lead_sales_readiness_checks;
begin
  if v_user is null
     or not app_private.has_permission('sales_readiness.write')
     or not app_private.has_permission('lead.read') then
    raise exception 'SALES_READINESS_WRITE_REQUIRED' using errcode = '42501';
  end if;

  select c.status into v_status
  from public.lead_sales_readiness_checks c
  where c.id = p_check_id
    and c.lead_id = p_lead_id
    and c.version = p_expected_version
    and c.is_current
    and c.status <> 'FINALIZED'
  for update;

  if not found then
    raise exception 'SALES_READINESS_CONFLICT_OR_INVALID_STATE' using errcode = '40001';
  end if;

  update public.lead_sales_readiness_checks
  set inspection_at = p_inspection_at,
      starting_situation = coalesce(p_starting_situation, ''),
      sale_objective = coalesce(p_sale_objective, ''),
      desired_timeframe = coalesce(p_desired_timeframe, ''),
      overall_assessment = coalesce(p_overall_assessment, ''),
      assumptions_and_uncertainties = coalesce(p_assumptions_and_uncertainties, ''),
      status = case when v_status = 'READY_FOR_REVIEW' then 'DRAFT' else v_status end
  where id = p_check_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.save_lead_sales_readiness_check(uuid, uuid, bigint, timestamptz, text, text, text, text, text) from public, anon;
grant execute on function public.save_lead_sales_readiness_check(uuid, uuid, bigint, timestamptz, text, text, text, text, text) to authenticated, service_role;

create or replace function public.save_lead_sales_readiness_scenario(
  p_check_id uuid,
  p_scenario_id uuid,
  p_expected_check_version bigint,
  p_title text,
  p_description text,
  p_assumptions text,
  p_internal_assessment text,
  p_recommendation_rationale text,
  p_confidence text,
  p_investment_min numeric,
  p_investment_max numeric,
  p_estimated_sale_price_min numeric,
  p_estimated_sale_price_max numeric,
  p_duration_weeks_min integer,
  p_duration_weeks_max integer,
  p_is_recommended boolean
)
returns public.lead_sales_readiness_checks
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_status text;
  v_result public.lead_sales_readiness_checks;
begin
  if v_user is null
     or not app_private.has_permission('sales_readiness.write')
     or not app_private.has_permission('lead.read') then
    raise exception 'SALES_READINESS_WRITE_REQUIRED' using errcode = '42501';
  end if;

  select c.status into v_status
  from public.lead_sales_readiness_checks c
  where c.id = p_check_id
    and c.version = p_expected_check_version
    and c.is_current
    and c.status <> 'FINALIZED'
  for update;

  if not found then
    raise exception 'SALES_READINESS_CONFLICT_OR_INVALID_STATE' using errcode = '40001';
  end if;

  if not exists (
    select 1 from public.lead_sales_readiness_scenarios
    where id = p_scenario_id and check_id = p_check_id
  ) then
    raise exception 'SALES_READINESS_SCENARIO_NOT_FOUND' using errcode = 'P0002';
  end if;

  if coalesce(p_is_recommended, false) then
    update public.lead_sales_readiness_scenarios
    set is_recommended = false
    where check_id = p_check_id
      and id <> p_scenario_id
      and is_recommended;
  end if;

  update public.lead_sales_readiness_scenarios
  set title = coalesce(p_title, ''),
      description = coalesce(p_description, ''),
      assumptions = coalesce(p_assumptions, ''),
      internal_assessment = coalesce(p_internal_assessment, ''),
      recommendation_rationale = coalesce(p_recommendation_rationale, ''),
      confidence = coalesce(nullif(p_confidence, ''), 'LOW'),
      investment_min = p_investment_min,
      investment_max = p_investment_max,
      estimated_sale_price_min = p_estimated_sale_price_min,
      estimated_sale_price_max = p_estimated_sale_price_max,
      duration_weeks_min = p_duration_weeks_min,
      duration_weeks_max = p_duration_weeks_max,
      is_recommended = coalesce(p_is_recommended, false)
  where id = p_scenario_id and check_id = p_check_id;

  update public.lead_sales_readiness_checks
  set status = case when v_status = 'READY_FOR_REVIEW' then 'DRAFT' else v_status end
  where id = p_check_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.save_lead_sales_readiness_scenario(uuid, uuid, bigint, text, text, text, text, text, text, numeric, numeric, numeric, numeric, integer, integer, boolean) from public, anon;
grant execute on function public.save_lead_sales_readiness_scenario(uuid, uuid, bigint, text, text, text, text, text, text, numeric, numeric, numeric, numeric, integer, integer, boolean) to authenticated, service_role;

create or replace function public.record_lead_sales_readiness_owner_decision(
  p_check_id uuid,
  p_expected_version bigint,
  p_owner_decision text,
  p_owner_decision_at date,
  p_owner_decision_by text,
  p_owner_decision_note text
)
returns public.lead_sales_readiness_checks
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_result public.lead_sales_readiness_checks;
  v_decision text := coalesce(nullif(p_owner_decision, ''), 'OPEN');
  v_date date;
  v_decider text;
begin
  if v_user is null
     or not app_private.has_permission('sales_readiness.write')
     or not app_private.has_permission('lead.read') then
    raise exception 'SALES_READINESS_WRITE_REQUIRED' using errcode = '42501';
  end if;

  perform 1
  from public.lead_sales_readiness_checks c
  where c.id = p_check_id
    and c.version = p_expected_version
    and c.is_current
    and c.status <> 'FINALIZED'
  for update;

  if not found then
    raise exception 'SALES_READINESS_CONFLICT_OR_INVALID_STATE' using errcode = '40001';
  end if;

  if v_decision = 'OPEN' then
    v_date := null;
    v_decider := '';
  else
    v_date := coalesce(p_owner_decision_at, current_date);
    v_decider := btrim(coalesce(p_owner_decision_by, ''));
    if v_decider = '' then
      raise exception 'OWNER_DECISION_REQUIRES_DECIDER' using errcode = '23514';
    end if;
  end if;

  update public.lead_sales_readiness_checks
  set owner_decision = v_decision,
      owner_decision_at = v_date,
      owner_decision_by = v_decider,
      owner_decision_note = coalesce(p_owner_decision_note, '')
  where id = p_check_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.record_lead_sales_readiness_owner_decision(uuid, bigint, text, date, text, text) from public, anon;
grant execute on function public.record_lead_sales_readiness_owner_decision(uuid, bigint, text, date, text, text) to authenticated, service_role;

create or replace function public.save_lead_sales_readiness_measure(
  p_check_id uuid,
  p_measure_id uuid,
  p_expected_check_version bigint,
  p_category text,
  p_title text,
  p_description text,
  p_decision text,
  p_rationale text,
  p_cost_min numeric,
  p_cost_max numeric,
  p_quote_price numeric,
  p_approved_budget numeric,
  p_actual_cost numeric,
  p_responsible_party text,
  p_partner_company text,
  p_target_date date,
  p_status text,
  p_owner_approval_status text,
  p_owner_approval_at date,
  p_planned_start_date date,
  p_planned_end_date date,
  p_completed_at date,
  p_sort_order integer
)
returns public.lead_sales_readiness_checks
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_check_status text;
  v_status text := coalesce(nullif(p_status, ''), 'PROPOSED');
  v_decision text := coalesce(nullif(p_decision, ''), 'OPEN');
  v_owner_approval text := coalesce(nullif(p_owner_approval_status, ''), 'NOT_REQUESTED');
  v_owner_approval_at date := p_owner_approval_at;
  v_completed_at date := p_completed_at;
  v_result public.lead_sales_readiness_checks;
begin
  if v_user is null
     or not app_private.has_permission('sales_readiness.write')
     or not app_private.has_permission('lead.read') then
    raise exception 'SALES_READINESS_WRITE_REQUIRED' using errcode = '42501';
  end if;

  select c.status into v_check_status
  from public.lead_sales_readiness_checks c
  where c.id = p_check_id
    and c.version = p_expected_check_version
    and c.is_current
    and c.status <> 'FINALIZED'
  for update;

  if not found then
    raise exception 'SALES_READINESS_CONFLICT_OR_INVALID_STATE' using errcode = '40001';
  end if;

  if nullif(btrim(coalesce(p_title, '')), '') is null then
    raise exception 'SALES_READINESS_MEASURE_TITLE_REQUIRED' using errcode = '23514';
  end if;

  if v_decision in ('NOT_RECOMMENDED', 'NOT_REQUIRED')
     and v_status not in ('PROPOSED', 'DISMISSED') then
    raise exception 'MEASURE_DECISION_NOT_ACTIONABLE' using errcode = '23514';
  end if;

  if v_decision = 'OPEN'
     and v_status not in ('PROPOSED', 'QUOTE_REQUIRED', 'QUOTE_REQUESTED', 'QUOTE_RECEIVED') then
    raise exception 'MEASURE_DECISION_NOT_ACTIONABLE' using errcode = '23514';
  end if;

  if v_status = 'QUOTE_RECEIVED' and p_quote_price is null then
    raise exception 'MEASURE_REQUIRES_QUOTE_PRICE' using errcode = '23514';
  end if;

  if v_status in ('APPROVED', 'COMMISSIONED', 'PLANNED', 'IN_PROGRESS', 'DONE', 'CHECKED')
     and v_owner_approval not in ('APPROVED', 'NOT_REQUIRED') then
    raise exception 'MEASURE_REQUIRES_OWNER_APPROVAL' using errcode = '23514';
  end if;

  if v_owner_approval = 'APPROVED' then
    v_owner_approval_at := coalesce(v_owner_approval_at, current_date);
  else
    v_owner_approval_at := null;
  end if;

  if v_status in ('DONE', 'CHECKED') then
    v_completed_at := coalesce(v_completed_at, current_date);
  end if;

  if p_measure_id is null then
    insert into public.lead_sales_readiness_measures(
      check_id, category, title, description, decision, rationale,
      cost_min, cost_max, quote_price, approved_budget, actual_cost,
      responsible_party, partner_company, target_date, status,
      owner_approval_status, owner_approval_at,
      planned_start_date, planned_end_date, completed_at,
      sort_order, created_by, updated_by
    ) values (
      p_check_id,
      coalesce(nullif(p_category, ''), 'OTHER'),
      btrim(p_title),
      coalesce(p_description, ''),
      v_decision,
      coalesce(p_rationale, ''),
      p_cost_min,
      p_cost_max,
      p_quote_price,
      p_approved_budget,
      p_actual_cost,
      coalesce(p_responsible_party, ''),
      nullif(btrim(coalesce(p_partner_company, '')), ''),
      p_target_date,
      v_status,
      v_owner_approval,
      v_owner_approval_at,
      p_planned_start_date,
      p_planned_end_date,
      v_completed_at,
      greatest(coalesce(p_sort_order, 0), 0),
      v_user,
      v_user
    );
  else
    update public.lead_sales_readiness_measures
    set category = coalesce(nullif(p_category, ''), 'OTHER'),
        title = btrim(p_title),
        description = coalesce(p_description, ''),
        decision = v_decision,
        rationale = coalesce(p_rationale, ''),
        cost_min = p_cost_min,
        cost_max = p_cost_max,
        quote_price = p_quote_price,
        approved_budget = p_approved_budget,
        actual_cost = p_actual_cost,
        responsible_party = coalesce(p_responsible_party, ''),
        partner_company = nullif(btrim(coalesce(p_partner_company, '')), ''),
        target_date = p_target_date,
        status = v_status,
        owner_approval_status = v_owner_approval,
        owner_approval_at = v_owner_approval_at,
        planned_start_date = p_planned_start_date,
        planned_end_date = p_planned_end_date,
        completed_at = v_completed_at,
        sort_order = greatest(coalesce(p_sort_order, 0), 0)
    where id = p_measure_id and check_id = p_check_id;

    if not found then
      raise exception 'SALES_READINESS_MEASURE_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  update public.lead_sales_readiness_checks
  set status = case when v_check_status = 'READY_FOR_REVIEW' then 'DRAFT' else v_check_status end
  where id = p_check_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.save_lead_sales_readiness_measure(uuid, uuid, bigint, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, text, date, text, text, date, date, date, date, integer) from public, anon;
grant execute on function public.save_lead_sales_readiness_measure(uuid, uuid, bigint, text, text, text, text, text, numeric, numeric, numeric, numeric, numeric, text, text, date, text, text, date, date, date, date, integer) to authenticated, service_role;

create or replace function public.delete_lead_sales_readiness_measure(
  p_check_id uuid,
  p_measure_id uuid,
  p_expected_check_version bigint
)
returns public.lead_sales_readiness_checks
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_check_status text;
  v_result public.lead_sales_readiness_checks;
begin
  if v_user is null
     or not app_private.has_permission('sales_readiness.write')
     or not app_private.has_permission('lead.read') then
    raise exception 'SALES_READINESS_WRITE_REQUIRED' using errcode = '42501';
  end if;

  select c.status into v_check_status
  from public.lead_sales_readiness_checks c
  where c.id = p_check_id
    and c.version = p_expected_check_version
    and c.is_current
    and c.status <> 'FINALIZED'
  for update;

  if not found then
    raise exception 'SALES_READINESS_CONFLICT_OR_INVALID_STATE' using errcode = '40001';
  end if;

  delete from public.lead_sales_readiness_measures
  where id = p_measure_id and check_id = p_check_id;

  if not found then
    raise exception 'SALES_READINESS_MEASURE_NOT_FOUND' using errcode = 'P0002';
  end if;

  update public.lead_sales_readiness_checks
  set status = case when v_check_status = 'READY_FOR_REVIEW' then 'DRAFT' else v_check_status end
  where id = p_check_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.delete_lead_sales_readiness_measure(uuid, uuid, bigint) from public, anon;
grant execute on function public.delete_lead_sales_readiness_measure(uuid, uuid, bigint) to authenticated, service_role;

create or replace function public.mark_lead_sales_readiness_ready(
  p_check_id uuid,
  p_expected_version bigint
)
returns public.lead_sales_readiness_checks
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_check public.lead_sales_readiness_checks;
  v_scenario_count integer;
  v_recommended_count integer;
  v_complete_scenario_count integer;
  v_open_measure_count integer;
  v_result public.lead_sales_readiness_checks;
begin
  if v_user is null
     or not app_private.has_permission('sales_readiness.write')
     or not app_private.has_permission('lead.read') then
    raise exception 'SALES_READINESS_WRITE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_check
  from public.lead_sales_readiness_checks
  where id = p_check_id
    and version = p_expected_version
    and is_current
    and status = 'DRAFT'
  for update;

  if not found then
    raise exception 'SALES_READINESS_CONFLICT_OR_INVALID_STATE' using errcode = '40001';
  end if;

  if v_check.inspection_at is null
     or nullif(trim(v_check.starting_situation), '') is null
     or nullif(trim(v_check.sale_objective), '') is null
     or nullif(trim(v_check.overall_assessment), '') is null
     or nullif(trim(v_check.assumptions_and_uncertainties), '') is null then
    raise exception 'REVIEW_REQUIRES_COMPLETE_CHECK_BASICS' using errcode = '23514';
  end if;

  select
    count(*),
    count(*) filter (where s.is_recommended),
    count(*) filter (
      where length(btrim(s.title)) > 0
        and length(btrim(s.description)) > 0
        and length(btrim(s.assumptions)) > 0
        and length(btrim(s.internal_assessment)) > 0
        and s.estimated_sale_price_min is not null
        and s.estimated_sale_price_max is not null
        and s.duration_weeks_min is not null
        and s.duration_weeks_max is not null
        and (
          s.scenario_kind = 'AS_IS'
          or (s.investment_min is not null and s.investment_max is not null)
        )
        and (
          not s.is_recommended
          or length(btrim(s.recommendation_rationale)) > 0
        )
    )
  into v_scenario_count, v_recommended_count, v_complete_scenario_count
  from public.lead_sales_readiness_scenarios s
  where s.check_id = p_check_id;

  if v_scenario_count <> 3 or v_recommended_count <> 1 then
    raise exception 'REVIEW_REQUIRES_THREE_SCENARIOS_AND_ONE_RECOMMENDATION' using errcode = '23514';
  end if;

  if v_complete_scenario_count <> 3 then
    raise exception 'REVIEW_REQUIRES_COMPLETE_SCENARIOS' using errcode = '23514';
  end if;

  select count(*) into v_open_measure_count
  from public.lead_sales_readiness_measures
  where check_id = p_check_id and decision = 'OPEN';

  if v_open_measure_count > 0 then
    raise exception 'REVIEW_REQUIRES_DECIDED_MEASURES' using errcode = '23514';
  end if;

  perform set_config('app.sales_readiness_review', '1', true);

  update public.lead_sales_readiness_checks
  set status = 'READY_FOR_REVIEW'
  where id = p_check_id
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.mark_lead_sales_readiness_ready(uuid, bigint) from public, anon;
grant execute on function public.mark_lead_sales_readiness_ready(uuid, bigint) to authenticated, service_role;

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
  if v_user is null
     or not app_private.has_permission('sales_readiness.finalize')
     or not app_private.has_permission('lead.read') then
    raise exception 'SALES_READINESS_FINALIZE_REQUIRED' using errcode = '42501';
  end if;

  perform set_config('app.sales_readiness_finalization', '1', true);

  update public.lead_sales_readiness_checks
  set status = 'FINALIZED',
      finalized_at = now(),
      finalized_by = v_user
  where id = p_check_id
    and version = p_expected_version
    and is_current
    and status = 'READY_FOR_REVIEW'
  returning * into v_result;

  if not found then
    raise exception 'SALES_READINESS_CONFLICT_OR_INVALID_STATE' using errcode = '40001';
  end if;

  return v_result;
end;
$$;

revoke all on function public.finalize_lead_sales_readiness_check(uuid, bigint) from public, anon;
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
  if v_user is null
     or not app_private.has_permission('sales_readiness.finalize')
     or not app_private.has_permission('lead.read') then
    raise exception 'SALES_READINESS_FINALIZE_REQUIRED' using errcode = '42501';
  end if;

  select * into v_old
  from public.lead_sales_readiness_checks
  where id = p_check_id
    and version = p_expected_version
    and is_current
    and status = 'FINALIZED'
  for update;

  if not found then
    raise exception 'SALES_READINESS_CONFLICT_OR_INVALID_STATE' using errcode = '40001';
  end if;

  perform set_config('app.sales_readiness_revision', '1', true);

  update public.lead_sales_readiness_checks
  set is_current = false
  where id = v_old.id;

  insert into public.lead_sales_readiness_checks(
    lead_id, property_id, previous_check_id, revision_no, is_current, status,
    inspection_at, starting_situation, sale_objective, desired_timeframe,
    overall_assessment, assumptions_and_uncertainties, responsible_user,
    owner_decision, owner_decision_at, owner_decision_by, owner_decision_note,
    created_by, updated_by
  ) values (
    v_old.lead_id, v_old.property_id, v_old.id, v_old.revision_no + 1, true, 'DRAFT',
    v_old.inspection_at, v_old.starting_situation, v_old.sale_objective, v_old.desired_timeframe,
    v_old.overall_assessment, v_old.assumptions_and_uncertainties, v_old.responsible_user,
    'OPEN', null, '', '',
    v_user, v_user
  )
  returning id into v_new_id;

  insert into public.lead_sales_readiness_scenarios(
    check_id, scenario_kind, title, description, assumptions,
    internal_assessment, recommendation_rationale, confidence,
    investment_min, investment_max,
    estimated_sale_price_min, estimated_sale_price_max,
    duration_weeks_min, duration_weeks_max,
    is_recommended, sort_order, created_by, updated_by
  )
  select
    v_new_id, scenario_kind, title, description, assumptions,
    internal_assessment, recommendation_rationale, confidence,
    investment_min, investment_max,
    estimated_sale_price_min, estimated_sale_price_max,
    duration_weeks_min, duration_weeks_max,
    is_recommended, sort_order, v_user, v_user
  from public.lead_sales_readiness_scenarios
  where check_id = v_old.id;

  insert into public.lead_sales_readiness_measures(
    check_id, category, title, description, decision, rationale,
    cost_min, cost_max, quote_price, approved_budget, actual_cost,
    responsible_party, responsible_user, partner_company, target_date,
    status, owner_approval_status, owner_approval_at,
    planned_start_date, planned_end_date, completed_at,
    sort_order, created_by, updated_by
  )
  select
    v_new_id, category, title, description, decision, rationale,
    cost_min, cost_max, quote_price, approved_budget,
    case when status in ('DONE', 'CHECKED') then actual_cost else null end,
    responsible_party, responsible_user, partner_company, target_date,
    case when status in ('DONE', 'CHECKED') then status else 'PROPOSED' end,
    case when status in ('DONE', 'CHECKED') then owner_approval_status else 'NOT_REQUESTED' end,
    case when status in ('DONE', 'CHECKED') then owner_approval_at else null end,
    case when status in ('DONE', 'CHECKED') then planned_start_date else null end,
    case when status in ('DONE', 'CHECKED') then planned_end_date else null end,
    case when status in ('DONE', 'CHECKED') then completed_at else null end,
    sort_order, v_user, v_user
  from public.lead_sales_readiness_measures
  where check_id = v_old.id;

  return v_new_id;
end;
$$;

revoke all on function public.create_lead_sales_readiness_revision(uuid, bigint) from public, anon;
grant execute on function public.create_lead_sales_readiness_revision(uuid, bigint) to authenticated, service_role;

create or replace function public.create_tasks_from_sales_readiness_measures(
  p_check_id uuid,
  p_measure_ids uuid[],
  p_expected_check_version bigint
)
returns table(measure_id uuid, task_id uuid)
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_lead_id uuid;
  v_contact_id uuid;
  v_default_responsible uuid;
begin
  if v_user is null
     or not app_private.has_permission('sales_readiness.write')
     or not app_private.has_permission('task.write')
     or not app_private.has_permission('lead.read') then
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
    select 1
    from unnest(p_measure_ids) requested_id
    where not exists (
      select 1
      from public.lead_sales_readiness_measures m
      where m.id = requested_id
        and m.check_id = p_check_id
        and m.decision in ('URGENTLY_RECOMMENDED', 'RECOMMENDED', 'OPTIONAL')
        and m.status not in ('DONE', 'CHECKED', 'DISMISSED')
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
    concat(
      'Verkaufsfertig-Check · ', m.category, E'\n\n',
      nullif(m.description, ''),
      case when nullif(m.rationale, '') is not null then E'\n\nBegründung: ' || m.rationale else '' end
    ),
    'OPEN',
    case when m.decision = 'URGENTLY_RECOMMENDED' then 'HIGH' else 'NORMAL' end,
    (
      coalesce(
        m.target_date,
        current_date + case when m.decision = 'URGENTLY_RECOMMENDED' then 7 else 14 end
      )::date + time '09:00'
    ) at time zone 'Europe/Berlin',
    coalesce(m.responsible_user, v_default_responsible),
    v_contact_id,
    v_lead_id,
    m.id,
    v_user,
    v_user
  from public.lead_sales_readiness_measures m
  where m.check_id = p_check_id
    and m.id = any(p_measure_ids)
  on conflict (sales_readiness_measure_id) do nothing;

  return query
  select m.id, t.id
  from public.lead_sales_readiness_measures m
  join public.tasks t on t.sales_readiness_measure_id = m.id
  where m.check_id = p_check_id
    and m.id = any(p_measure_ids)
  order by m.sort_order, m.id;
end;
$$;

revoke all on function public.create_tasks_from_sales_readiness_measures(uuid, uuid[], bigint) from public, anon;
grant execute on function public.create_tasks_from_sales_readiness_measures(uuid, uuid[], bigint) to authenticated, service_role;
