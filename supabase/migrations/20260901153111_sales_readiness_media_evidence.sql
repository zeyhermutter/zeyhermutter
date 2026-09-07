alter table public.lead_sales_readiness_media
  drop constraint if exists lead_sales_readiness_media_storage_unique;

alter table public.lead_sales_readiness_media
  add constraint lead_sales_readiness_media_check_storage_unique
  unique (check_id, storage_bucket, storage_object_path);

alter table public.lead_sales_readiness_media
  drop constraint if exists lead_sales_readiness_media_area_key_allowed;

alter table public.lead_sales_readiness_media
  add constraint lead_sales_readiness_media_area_key_allowed
  check (area_key in ('CURRENT_STATE','DETAIL','MEASURE_EVIDENCE','MEASURE_DOCUMENTATION','OTHER'));

create index if not exists lead_sales_readiness_media_check_stage_idx
  on public.lead_sales_readiness_media(check_id, stage, created_at);

create index if not exists lead_sales_readiness_media_measure_idx
  on public.lead_sales_readiness_media(measure_id)
  where measure_id is not null;

create or replace function app_private.validate_sales_readiness_media_linkage()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_property_id uuid;
  v_is_revision boolean := coalesce(current_setting('app.sales_readiness_revision', true), '') = '1';
begin
  if new.measure_id is not null and not exists (
    select 1 from public.lead_sales_readiness_measures m
    where m.id = new.measure_id and m.check_id = new.check_id
  ) then
    raise exception 'SALES_READINESS_MEDIA_MEASURE_MISMATCH' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE'
     and old.storage_bucket = new.storage_bucket
     and old.storage_object_path = new.storage_object_path then
    return new;
  end if;

  if v_is_revision then return new; end if;

  select c.property_id into v_property_id
  from public.lead_sales_readiness_checks c
  where c.id = new.check_id;

  if v_property_id is null then
    raise exception 'SALES_READINESS_MEDIA_PROPERTY_REQUIRED' using errcode = '23514';
  end if;

  if exists (
    select 1 from public.property_media pm
    where pm.property_id = v_property_id
      and pm.archived_at is null
      and pm.storage_bucket = new.storage_bucket
      and pm.storage_path = new.storage_object_path
  ) or exists (
    select 1
    from public.documents d
    join public.document_versions dv
      on dv.document_id = d.id and dv.version_number = d.current_version
    where d.property_id = v_property_id
      and d.archived_at is null
      and dv.storage_bucket = new.storage_bucket
      and dv.storage_path = new.storage_object_path
  ) then
    return new;
  end if;

  raise exception 'SALES_READINESS_MEDIA_SOURCE_INVALID' using errcode = '23514';
end;
$function$;

create or replace function app_private.touch_sales_readiness_check_from_media()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
declare
  v_check_id uuid := coalesce(new.check_id, old.check_id);
begin
  if coalesce(current_setting('app.sales_readiness_revision', true), '') = '1' then return null; end if;

  update public.lead_sales_readiness_checks
  set status = case when status = 'READY_FOR_REVIEW' then 'DRAFT' else status end,
      owner_decision = case when status = 'READY_FOR_REVIEW' then 'OPEN' else owner_decision end,
      owner_decision_at = case when status = 'READY_FOR_REVIEW' then null else owner_decision_at end,
      owner_decision_by = case when status = 'READY_FOR_REVIEW' then '' else owner_decision_by end,
      owner_decision_note = case when status = 'READY_FOR_REVIEW' then '' else owner_decision_note end
  where id = v_check_id and status <> 'FINALIZED';

  return null;
end;
$function$;

drop trigger if exists lead_sales_readiness_media_20_linkage on public.lead_sales_readiness_media;
create trigger lead_sales_readiness_media_20_linkage
before insert or update on public.lead_sales_readiness_media
for each row execute function app_private.validate_sales_readiness_media_linkage();

drop trigger if exists lead_sales_readiness_media_80_touch_check on public.lead_sales_readiness_media;
create trigger lead_sales_readiness_media_80_touch_check
after insert or update or delete on public.lead_sales_readiness_media
for each row execute function app_private.touch_sales_readiness_check_from_media();

create or replace function public.save_lead_sales_readiness_media(
  p_check_id uuid,
  p_media_id uuid,
  p_expected_check_version bigint,
  p_measure_id uuid,
  p_area_key text,
  p_stage text,
  p_storage_bucket text,
  p_storage_object_path text,
  p_internal_note text
)
returns public.lead_sales_readiness_checks
language plpgsql
set search_path = public, app_private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_result public.lead_sales_readiness_checks;
begin
  if v_user is null
     or not app_private.has_permission('sales_readiness.write')
     or not app_private.has_permission('lead.read') then
    raise exception 'SALES_READINESS_WRITE_REQUIRED' using errcode = '42501';
  end if;

  perform 1
  from public.lead_sales_readiness_checks c
  where c.id = p_check_id
    and c.version = p_expected_check_version
    and c.is_current
    and c.status <> 'FINALIZED'
  for update;

  if not found then
    raise exception 'SALES_READINESS_CONFLICT_OR_INVALID_STATE' using errcode = '40001';
  end if;

  if p_media_id is null then
    insert into public.lead_sales_readiness_media(
      check_id, measure_id, area_key, stage,
      storage_bucket, storage_object_path, internal_note,
      created_by, updated_by
    ) values (
      p_check_id, p_measure_id, p_area_key, p_stage,
      btrim(p_storage_bucket), btrim(p_storage_object_path), coalesce(p_internal_note, ''),
      v_user, v_user
    );
  else
    update public.lead_sales_readiness_media
    set measure_id = p_measure_id,
        area_key = p_area_key,
        stage = p_stage,
        internal_note = coalesce(p_internal_note, '')
    where id = p_media_id and check_id = p_check_id;

    if not found then
      raise exception 'SALES_READINESS_MEDIA_NOT_FOUND' using errcode = 'P0002';
    end if;
  end if;

  select * into v_result from public.lead_sales_readiness_checks where id = p_check_id;
  return v_result;
end;
$function$;

create or replace function public.delete_lead_sales_readiness_media(
  p_check_id uuid,
  p_media_id uuid,
  p_expected_check_version bigint
)
returns public.lead_sales_readiness_checks
language plpgsql
set search_path = public, app_private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_result public.lead_sales_readiness_checks;
begin
  if v_user is null
     or not app_private.has_permission('sales_readiness.write')
     or not app_private.has_permission('lead.read') then
    raise exception 'SALES_READINESS_WRITE_REQUIRED' using errcode = '42501';
  end if;

  perform 1
  from public.lead_sales_readiness_checks c
  where c.id = p_check_id
    and c.version = p_expected_check_version
    and c.is_current
    and c.status <> 'FINALIZED'
  for update;

  if not found then
    raise exception 'SALES_READINESS_CONFLICT_OR_INVALID_STATE' using errcode = '40001';
  end if;

  delete from public.lead_sales_readiness_media
  where id = p_media_id and check_id = p_check_id;

  if not found then
    raise exception 'SALES_READINESS_MEDIA_NOT_FOUND' using errcode = 'P0002';
  end if;

  select * into v_result from public.lead_sales_readiness_checks where id = p_check_id;
  return v_result;
end;
$function$;

revoke all on function public.save_lead_sales_readiness_media(uuid,uuid,bigint,uuid,text,text,text,text,text) from public;
grant execute on function public.save_lead_sales_readiness_media(uuid,uuid,bigint,uuid,text,text,text,text,text) to authenticated;
revoke all on function public.delete_lead_sales_readiness_media(uuid,uuid,bigint) from public;
grant execute on function public.delete_lead_sales_readiness_media(uuid,uuid,bigint) to authenticated;

create or replace function public.create_lead_sales_readiness_revision(p_check_id uuid, p_expected_version bigint)
returns uuid
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $function$
declare
  v_user uuid := auth.uid();
  v_old public.lead_sales_readiness_checks;
  v_new_id uuid;
  v_old_measure public.lead_sales_readiness_measures;
  v_new_measure_id uuid;
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

  update public.lead_sales_readiness_checks set is_current = false where id = v_old.id;

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
    'OPEN', null, '', '', v_user, v_user
  ) returning id into v_new_id;

  insert into public.lead_sales_readiness_scenarios(
    check_id, scenario_kind, title, description, assumptions,
    internal_assessment, recommendation_rationale, confidence,
    investment_min, investment_max, estimated_sale_price_min, estimated_sale_price_max,
    duration_weeks_min, duration_weeks_max, is_recommended, sort_order, created_by, updated_by
  )
  select v_new_id, scenario_kind, title, description, assumptions,
    internal_assessment, recommendation_rationale, confidence,
    investment_min, investment_max, estimated_sale_price_min, estimated_sale_price_max,
    duration_weeks_min, duration_weeks_max, is_recommended, sort_order, v_user, v_user
  from public.lead_sales_readiness_scenarios where check_id = v_old.id;

  for v_old_measure in
    select * from public.lead_sales_readiness_measures
    where check_id = v_old.id order by sort_order, created_at, id
  loop
    insert into public.lead_sales_readiness_measures(
      check_id, category, title, description, decision, rationale,
      cost_min, cost_max, quote_price, approved_budget, actual_cost,
      responsible_party, responsible_user, partner_company, target_date,
      status, owner_approval_status, owner_approval_at,
      planned_start_date, planned_end_date, completed_at,
      sort_order, created_by, updated_by
    ) values (
      v_new_id, v_old_measure.category, v_old_measure.title, v_old_measure.description,
      v_old_measure.decision, v_old_measure.rationale,
      v_old_measure.cost_min, v_old_measure.cost_max, v_old_measure.quote_price,
      v_old_measure.approved_budget,
      case when v_old_measure.status in ('DONE','CHECKED') then v_old_measure.actual_cost else null end,
      v_old_measure.responsible_party, v_old_measure.responsible_user,
      v_old_measure.partner_company, v_old_measure.target_date,
      case when v_old_measure.status in ('DONE','CHECKED') then v_old_measure.status else 'PROPOSED' end,
      case when v_old_measure.status in ('DONE','CHECKED') then v_old_measure.owner_approval_status else 'NOT_REQUESTED' end,
      case when v_old_measure.status in ('DONE','CHECKED') then v_old_measure.owner_approval_at else null end,
      case when v_old_measure.status in ('DONE','CHECKED') then v_old_measure.planned_start_date else null end,
      case when v_old_measure.status in ('DONE','CHECKED') then v_old_measure.planned_end_date else null end,
      case when v_old_measure.status in ('DONE','CHECKED') then v_old_measure.completed_at else null end,
      v_old_measure.sort_order, v_user, v_user
    ) returning id into v_new_measure_id;

    insert into public.lead_sales_readiness_media(
      check_id, measure_id, area_key, stage, storage_bucket, storage_object_path, internal_note,
      marketing_use_approved, marketing_approved_at, marketing_approved_by, created_by, updated_by
    )
    select v_new_id, v_new_measure_id, area_key, stage, storage_bucket, storage_object_path, internal_note,
      marketing_use_approved, marketing_approved_at, marketing_approved_by, v_user, v_user
    from public.lead_sales_readiness_media
    where check_id = v_old.id and measure_id = v_old_measure.id;
  end loop;

  insert into public.lead_sales_readiness_media(
    check_id, measure_id, area_key, stage, storage_bucket, storage_object_path, internal_note,
    marketing_use_approved, marketing_approved_at, marketing_approved_by, created_by, updated_by
  )
  select v_new_id, null, area_key, stage, storage_bucket, storage_object_path, internal_note,
    marketing_use_approved, marketing_approved_at, marketing_approved_by, v_user, v_user
  from public.lead_sales_readiness_media
  where check_id = v_old.id and measure_id is null;

  return v_new_id;
end;
$function$;
