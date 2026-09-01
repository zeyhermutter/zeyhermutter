revoke all on function app_private.set_sales_readiness_update_metadata() from public, anon, authenticated, service_role;

alter table public.lead_sales_readiness_checks
  drop constraint if exists lead_sales_readiness_checks_owner_decision_stage;
alter table public.lead_sales_readiness_checks
  add constraint lead_sales_readiness_checks_owner_decision_stage
  check (
    (status = 'DRAFT' and owner_decision = 'OPEN')
    or status = 'READY_FOR_REVIEW'
    or (status = 'FINALIZED' and owner_decision <> 'OPEN')
  );

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
      status = case when v_status = 'READY_FOR_REVIEW' then 'DRAFT' else v_status end,
      owner_decision = case when v_status = 'READY_FOR_REVIEW' then 'OPEN' else owner_decision end,
      owner_decision_at = case when v_status = 'READY_FOR_REVIEW' then null else owner_decision_at end,
      owner_decision_by = case when v_status = 'READY_FOR_REVIEW' then '' else owner_decision_by end,
      owner_decision_note = case when v_status = 'READY_FOR_REVIEW' then '' else owner_decision_note end
  where id = p_check_id
  returning * into v_result;

  return v_result;
end;
$$;

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
  set status = case when v_status = 'READY_FOR_REVIEW' then 'DRAFT' else v_status end,
      owner_decision = case when v_status = 'READY_FOR_REVIEW' then 'OPEN' else owner_decision end,
      owner_decision_at = case when v_status = 'READY_FOR_REVIEW' then null else owner_decision_at end,
      owner_decision_by = case when v_status = 'READY_FOR_REVIEW' then '' else owner_decision_by end,
      owner_decision_note = case when v_status = 'READY_FOR_REVIEW' then '' else owner_decision_note end
  where id = p_check_id
  returning * into v_result;

  return v_result;
end;
$$;

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
    and c.status = 'READY_FOR_REVIEW'
  for update;

  if not found then
    raise exception 'SALES_READINESS_CONFLICT_OR_NOT_READY' using errcode = '40001';
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
  set status = case when v_check_status = 'READY_FOR_REVIEW' then 'DRAFT' else v_check_status end,
      owner_decision = case when v_check_status = 'READY_FOR_REVIEW' then 'OPEN' else owner_decision end,
      owner_decision_at = case when v_check_status = 'READY_FOR_REVIEW' then null else owner_decision_at end,
      owner_decision_by = case when v_check_status = 'READY_FOR_REVIEW' then '' else owner_decision_by end,
      owner_decision_note = case when v_check_status = 'READY_FOR_REVIEW' then '' else owner_decision_note end
  where id = p_check_id
  returning * into v_result;

  return v_result;
end;
$$;

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
  set status = case when v_check_status = 'READY_FOR_REVIEW' then 'DRAFT' else v_check_status end,
      owner_decision = case when v_check_status = 'READY_FOR_REVIEW' then 'OPEN' else owner_decision end,
      owner_decision_at = case when v_check_status = 'READY_FOR_REVIEW' then null else owner_decision_at end,
      owner_decision_by = case when v_check_status = 'READY_FOR_REVIEW' then '' else owner_decision_by end,
      owner_decision_note = case when v_check_status = 'READY_FOR_REVIEW' then '' else owner_decision_note end
  where id = p_check_id
  returning * into v_result;

  return v_result;
end;
$$;
