create or replace function public.create_lead_sales_readiness_draft(p_lead_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_existing uuid;
  v_check_id uuid;
  v_property_id uuid;
  v_responsible uuid;
begin
  if v_user is null or not app_private.has_permission('sales_readiness.write') or not app_private.has_permission('lead.read') then
    raise exception 'SALES_READINESS_WRITE_REQUIRED' using errcode = '42501';
  end if;
  select id into v_existing from public.lead_sales_readiness_checks where lead_id = p_lead_id and is_current limit 1;
  if v_existing is not null then return v_existing; end if;
  select l.converted_property_id, coalesce(l.primary_responsible_user, v_user) into v_property_id, v_responsible
  from public.leads l where l.id = p_lead_id and l.archived_at is null;
  if not found then raise exception 'SALES_READINESS_LEAD_NOT_FOUND' using errcode = 'P0002'; end if;
  insert into public.lead_sales_readiness_checks(lead_id, property_id, responsible_user, created_by, updated_by)
  values (p_lead_id, v_property_id, v_responsible, v_user, v_user) returning id into v_check_id;
  insert into public.lead_sales_readiness_scenarios(check_id, scenario_kind, title, description, assumptions, confidence, is_recommended, sort_order, created_by, updated_by)
  values
    (v_check_id, 'AS_IS', 'Verkauf im Ist-Zustand', '', '', 'LOW', false, 10, v_user, v_user),
    (v_check_id, 'RECOMMENDED_PREPARATION', 'Empfohlene Verkaufsaufbereitung', '', '', 'LOW', false, 20, v_user, v_user),
    (v_check_id, 'EXTENDED_MEASURES', 'Erweiterte Maßnahmen', '', '', 'LOW', false, 30, v_user, v_user);
  return v_check_id;
end;
$$;
revoke all on function public.create_lead_sales_readiness_draft(uuid) from public, anon;
grant execute on function public.create_lead_sales_readiness_draft(uuid) to authenticated, service_role;

create or replace function public.mark_lead_sales_readiness_ready(p_check_id uuid, p_expected_version bigint)
returns public.lead_sales_readiness_checks
language plpgsql
security invoker
set search_path = public, app_private, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_scenario_count integer;
  v_recommended_count integer;
  v_result public.lead_sales_readiness_checks;
begin
  if v_user is null or not app_private.has_permission('sales_readiness.write') then
    raise exception 'SALES_READINESS_WRITE_REQUIRED' using errcode = '42501';
  end if;
  select count(*), count(*) filter (where is_recommended) into v_scenario_count, v_recommended_count
  from public.lead_sales_readiness_scenarios where check_id = p_check_id;
  if v_scenario_count <> 3 or v_recommended_count <> 1 then
    raise exception 'REVIEW_REQUIRES_THREE_SCENARIOS_AND_ONE_RECOMMENDATION' using errcode = '23514';
  end if;
  update public.lead_sales_readiness_checks set status = 'READY_FOR_REVIEW'
  where id = p_check_id and version = p_expected_version and is_current and status = 'DRAFT'
    and nullif(trim(overall_assessment), '') is not null
    and nullif(trim(assumptions_and_uncertainties), '') is not null
  returning * into v_result;
  if not found then raise exception 'SALES_READINESS_CONFLICT_OR_INCOMPLETE' using errcode = '40001'; end if;
  return v_result;
end;
$$;
revoke all on function public.mark_lead_sales_readiness_ready(uuid, bigint) from public, anon;
grant execute on function public.mark_lead_sales_readiness_ready(uuid, bigint) to authenticated, service_role;
