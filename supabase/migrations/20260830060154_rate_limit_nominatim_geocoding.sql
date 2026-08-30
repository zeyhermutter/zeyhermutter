create table if not exists app_private.external_service_rate_limits (
  service text primary key,
  next_allowed_at timestamptz not null default clock_timestamp()
);

revoke all on table app_private.external_service_rate_limits from public, anon, authenticated;

insert into app_private.external_service_rate_limits(service, next_allowed_at)
values ('nominatim', clock_timestamp())
on conflict (service) do nothing;

create or replace function public.reserve_nominatim_slot()
returns integer
language plpgsql
security definer
set search_path = pg_catalog, app_private, public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_slot timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into app_private.external_service_rate_limits(service, next_allowed_at)
  values ('nominatim', v_now)
  on conflict (service) do nothing;

  select greatest(next_allowed_at, v_now)
  into v_slot
  from app_private.external_service_rate_limits
  where service = 'nominatim'
  for update;

  update app_private.external_service_rate_limits
  set next_allowed_at = v_slot + interval '1100 milliseconds'
  where service = 'nominatim';

  return greatest(0, ceil(extract(epoch from (v_slot - v_now)) * 1000)::integer);
end;
$$;

revoke all on function public.reserve_nominatim_slot() from public, anon;
grant execute on function public.reserve_nominatim_slot() to authenticated;
