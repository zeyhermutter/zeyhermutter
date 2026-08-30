create or replace function app_private.set_business_update_metadata()
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

  if old.archived_at is distinct from new.archived_at then
    if new.archived_at is null then
      new.archived_by := null;
    else
      new.archived_by := auth.uid();
    end if;
  else
    new.archived_by := old.archived_by;
  end if;

  return new;
end;
$$;
revoke all on function app_private.set_business_update_metadata() from public;

create or replace function app_private.set_standard_update_metadata()
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
revoke all on function app_private.set_standard_update_metadata() from public;
