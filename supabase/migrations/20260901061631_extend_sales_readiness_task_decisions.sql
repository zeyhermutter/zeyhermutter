alter table public.lead_sales_readiness_measures
  drop constraint if exists lead_sales_readiness_measures_decision_check;

alter table public.lead_sales_readiness_measures
  add constraint lead_sales_readiness_measures_decision_check
  check (decision = any (array[
    'URGENTLY_RECOMMENDED'::text,
    'RECOMMENDED'::text,
    'OPTIONAL'::text,
    'NOT_RECOMMENDED'::text,
    'NOT_REQUIRED'::text,
    'OPEN'::text
  ]));

create or replace function public.create_tasks_from_sales_readiness_measures(
  p_check_id uuid,
  p_measure_ids uuid[],
  p_expected_check_version bigint
)
returns table(measure_id uuid, task_id uuid)
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
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
    select 1
    from unnest(p_measure_ids) requested_id
    where not exists (
      select 1
      from public.lead_sales_readiness_measures m
      where m.id = requested_id
        and m.check_id = p_check_id
        and m.decision in ('URGENTLY_RECOMMENDED', 'RECOMMENDED', 'OPTIONAL')
        and m.status <> 'DISMISSED'
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
      'Verkaufsfertig-Check · ', m.category, E'\n\n', nullif(m.description, ''),
      case when nullif(m.rationale, '') is not null then E'\n\nBegründung: ' || m.rationale else '' end
    ),
    'OPEN',
    'NORMAL',
    (coalesce(m.target_date, current_date + 14)::date + time '09:00') at time zone 'Europe/Berlin',
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
$function$;
