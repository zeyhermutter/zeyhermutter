create or replace function app_private.ensure_new_search_profile_has_location()
returns trigger
language plpgsql
set search_path=public,pg_temp
as $$
begin
  if exists(select 1 from public.search_profiles sp where sp.id=new.id)
     and not exists(select 1 from public.search_profile_locations sl where sl.search_profile_id=new.id) then
    raise exception 'SEARCH_PROFILE_LOCATION_REQUIRED' using errcode='23514';
  end if;
  return new;
end;
$$;
revoke all on function app_private.ensure_new_search_profile_has_location() from public;
drop trigger if exists search_profiles_location_commit_guard on public.search_profiles;
create constraint trigger search_profiles_location_commit_guard
after insert on public.search_profiles
deferrable initially deferred
for each row execute function app_private.ensure_new_search_profile_has_location();
