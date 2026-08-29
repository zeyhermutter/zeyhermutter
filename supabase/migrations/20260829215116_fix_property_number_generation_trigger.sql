alter table public.properties alter column property_number drop default;

create or replace function app_private.assign_property_number()
returns trigger
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
begin
  if new.property_number is null or trim(new.property_number) = '' then
    new.property_number := app_private.next_property_number();
  end if;
  return new;
end;
$$;
revoke all on function app_private.assign_property_number() from public;

drop trigger if exists properties_assign_number on public.properties;
create trigger properties_assign_number
before insert on public.properties
for each row execute function app_private.assign_property_number();