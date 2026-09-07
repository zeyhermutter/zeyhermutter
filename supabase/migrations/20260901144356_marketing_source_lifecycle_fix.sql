create or replace function app_private.validate_property_marketing_placement()
returns trigger
language plpgsql
set search_path = public, app_private, pg_temp
as $$
declare
  v_property_status text;
  v_publication_property_id uuid;
  v_publication_approved_at timestamptz;
  v_expose_property_id uuid;
  v_expose_status text;
  v_source_requires_current_approval boolean := false;
begin
  if tg_op = 'UPDATE' then
    if old.property_id is distinct from new.property_id then
      raise exception 'MARKETING_PROPERTY_IMMUTABLE' using errcode = '22023';
    end if;

    if old.status = 'LIVE' and (
      old.channel_type is distinct from new.channel_type
      or old.channel_name is distinct from new.channel_name
      or old.delivery_mode is distinct from new.delivery_mode
      or old.publication_version_id is distinct from new.publication_version_id
      or old.expose_id is distinct from new.expose_id
    ) then
      raise exception 'PAUSE_MARKETING_BEFORE_SOURCE_CHANGE' using errcode = '22023';
    end if;

    v_source_requires_current_approval :=
      old.publication_version_id is distinct from new.publication_version_id
      or old.expose_id is distinct from new.expose_id
      or (old.status is distinct from new.status and new.status in ('READY','LIVE'));

    if old.status is distinct from new.status then
      if not (
        (old.status = 'PLANNED' and new.status in ('READY','ENDED'))
        or (old.status = 'READY' and new.status in ('PLANNED','LIVE','ENDED'))
        or (old.status = 'LIVE' and new.status in ('PAUSED','ERROR','ENDED'))
        or (old.status = 'PAUSED' and new.status in ('LIVE','ERROR','ENDED'))
        or (old.status = 'ERROR' and new.status in ('READY','ENDED'))
      ) then
        raise exception 'INVALID_MARKETING_STATUS_TRANSITION' using errcode = '22023';
      end if;

      if new.status in ('LIVE','PAUSED','ERROR','ENDED')
         and not app_private.has_permission('property.publish') then
        raise exception 'PROPERTY_PUBLISH_REQUIRED' using errcode = '42501';
      end if;
    end if;
  else
    v_source_requires_current_approval := true;
    if new.status <> 'PLANNED' then
      raise exception 'MARKETING_PLACEMENT_MUST_START_PLANNED' using errcode = '22023';
    end if;
  end if;

  select p.status into v_property_status
  from public.properties p
  where p.id = new.property_id and p.archived_at is null;
  if v_property_status is null then
    raise exception 'MARKETING_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;

  if new.publication_version_id is not null then
    select pp.property_id, ppv.approved_at
      into v_publication_property_id, v_publication_approved_at
    from public.property_publication_versions ppv
    join public.property_publications pp on pp.id = ppv.publication_id
    where ppv.id = new.publication_version_id;
    if v_publication_property_id is distinct from new.property_id then
      raise exception 'MARKETING_PUBLICATION_PROPERTY_MISMATCH' using errcode = '23514';
    end if;
    if v_source_requires_current_approval and v_publication_approved_at is null then
      raise exception 'MARKETING_PUBLICATION_NOT_APPROVED' using errcode = '23514';
    end if;
  end if;

  if new.expose_id is not null then
    select e.property_id, e.status
      into v_expose_property_id, v_expose_status
    from public.property_exposes e
    where e.id = new.expose_id;
    if v_expose_property_id is distinct from new.property_id then
      raise exception 'MARKETING_EXPOSE_PROPERTY_MISMATCH' using errcode = '23514';
    end if;
    if v_source_requires_current_approval and v_expose_status <> 'RELEASED' then
      raise exception 'MARKETING_EXPOSE_NOT_RELEASED' using errcode = '23514';
    end if;
  end if;

  if new.status in ('READY','LIVE','PAUSED','ERROR')
     and new.publication_version_id is null
     and new.expose_id is null then
    raise exception 'MARKETING_APPROVED_SOURCE_REQUIRED' using errcode = '23514';
  end if;

  if new.status = 'LIVE' and v_property_status not in ('MARKETING','RESERVED') then
    raise exception 'PROPERTY_NOT_IN_MARKETING' using errcode = '23514';
  end if;

  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    if new.status = 'LIVE' then
      new.live_at := coalesce(old.live_at, now());
      new.paused_at := null;
      new.ended_at := null;
    elsif new.status in ('PAUSED','ERROR') then
      new.paused_at := now();
    elsif new.status = 'ENDED' then
      new.ended_at := now();
    end if;
  end if;

  if tg_op = 'UPDATE' and old.last_verified_at is distinct from new.last_verified_at then
    new.last_verified_by := auth.uid();
  elsif tg_op = 'UPDATE' then
    new.last_verified_by := old.last_verified_by;
  end if;

  return new;
end;
$$;

revoke all on function app_private.validate_property_marketing_placement() from public, anon, authenticated;
