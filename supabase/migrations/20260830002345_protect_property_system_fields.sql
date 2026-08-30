create or replace function app_private.assign_property_number()
returns trigger
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
begin
  if new.status <> 'DRAFT'
     or new.status_before_archive is not null
     or new.archived_at is not null
     or new.archived_by is not null then
    raise exception 'new properties must start in DRAFT without archive metadata';
  end if;

  if new.primary_responsible_user is distinct from auth.uid()
     and not app_private.has_permission('property.assign') then
    raise exception 'missing property.assign permission';
  end if;

  new.property_number := app_private.next_property_number();
  return new;
end;
$$;
revoke all on function app_private.assign_property_number() from public;

create or replace function app_private.validate_property_status_transition()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.property_number is distinct from new.property_number then
    raise exception 'property number is system managed and immutable';
  end if;

  if old.status is not distinct from new.status then
    if old.status_before_archive is distinct from new.status_before_archive
       or old.archived_at is distinct from new.archived_at
       or old.archived_by is distinct from new.archived_by then
      raise exception 'property archive metadata is system managed';
    end if;
    return new;
  end if;

  if new.status = 'ARCHIVED' then
    if not exists (
      select 1
      from public.property_status_transitions t
      where t.from_status = old.status
        and t.to_status = 'ARCHIVED'
    ) then
      raise exception 'invalid property status transition: % -> ARCHIVED', old.status;
    end if;

    new.status_before_archive := old.status;
    new.archived_at := now();
    new.archived_by := auth.uid();
    return new;
  end if;

  if old.status = 'ARCHIVED' then
    if old.status_before_archive is null
       or new.status <> old.status_before_archive then
      raise exception 'archived property can only be restored to its previous status';
    end if;

    new.status_before_archive := null;
    new.archived_at := null;
    new.archived_by := null;
    return new;
  end if;

  if old.status_before_archive is distinct from new.status_before_archive
     or old.archived_at is distinct from new.archived_at
     or old.archived_by is distinct from new.archived_by then
    raise exception 'property archive metadata is system managed';
  end if;

  if not exists (
    select 1
    from public.property_status_transitions t
    where t.from_status = old.status
      and t.to_status = new.status
  ) then
    raise exception 'invalid property status transition: % -> %', old.status, new.status;
  end if;

  return new;
end;
$$;
revoke all on function app_private.validate_property_status_transition() from public;
