create or replace function app_private.normalize_search_profile_location()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  new.postal_code:=nullif(btrim(coalesce(new.postal_code,'')),'');
  new.city:=nullif(btrim(coalesce(new.city,'')),'');
  new.district:=nullif(btrim(coalesce(new.district,'')),'');
  if new.postal_code is null and new.city ~ '^[0-9]{5}$' then
    new.postal_code:=new.city;
    new.city:=null;
  end if;
  return new;
end;
$$;
revoke all on function app_private.normalize_search_profile_location() from public;
drop trigger if exists search_profile_locations_normalize on public.search_profile_locations;
create trigger search_profile_locations_normalize
before insert or update of postal_code,city,district on public.search_profile_locations
for each row execute function app_private.normalize_search_profile_location();

update public.search_profile_locations
set postal_code=city,city=null
where postal_code is null and city ~ '^[0-9]{5}$';
