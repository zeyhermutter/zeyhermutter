create or replace function app_private.set_business_update_metadata()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.version := old.version + 1;

  if old.archived_at is distinct from new.archived_at then
    if new.archived_at is null then
      new.archived_by := null;
    else
      new.archived_by := auth.uid();
    end if;
  end if;

  return new;
end;
$$;
