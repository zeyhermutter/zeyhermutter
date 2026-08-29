-- Ensure business entities always record the authenticated user who last changed them.

create or replace function app_private.set_business_update_metadata()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.version := old.version + 1;
  return new;
end;
$$;

revoke all on function app_private.set_business_update_metadata() from public;
grant execute on function app_private.set_business_update_metadata() to authenticated;

drop trigger if exists contacts_set_updated_at_and_version on public.contacts;
drop trigger if exists organizations_set_updated_at_and_version on public.organizations;
drop trigger if exists tasks_set_updated_at_and_version on public.tasks;

create trigger contacts_set_update_metadata before update on public.contacts
for each row execute function app_private.set_business_update_metadata();
create trigger organizations_set_update_metadata before update on public.organizations
for each row execute function app_private.set_business_update_metadata();
create trigger tasks_set_update_metadata before update on public.tasks
for each row execute function app_private.set_business_update_metadata();
