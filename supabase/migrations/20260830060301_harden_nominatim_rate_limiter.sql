create schema if not exists rate_private;
revoke all on schema rate_private from public, anon;
grant usage on schema rate_private to authenticated;

create table if not exists rate_private.external_service_rate_limits (
  service text primary key,
  next_allowed_at timestamptz not null default clock_timestamp()
);

insert into rate_private.external_service_rate_limits(service, next_allowed_at)
select service, next_allowed_at
from app_private.external_service_rate_limits
on conflict (service) do update
set next_allowed_at = greatest(rate_private.external_service_rate_limits.next_allowed_at, excluded.next_allowed_at);

grant select, insert, update on table rate_private.external_service_rate_limits to authenticated;
revoke all on table rate_private.external_service_rate_limits from anon;

create or replace function public.reserve_nominatim_slot()
returns integer
language plpgsql
security invoker
set search_path = pg_catalog, rate_private, public, pg_temp
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_slot timestamptz;
begin
  if auth.uid() is null then
    raise exception 'authentication required';
  end if;

  insert into rate_private.external_service_rate_limits(service, next_allowed_at)
  values ('nominatim', v_now)
  on conflict (service) do nothing;

  select greatest(next_allowed_at, v_now)
  into v_slot
  from rate_private.external_service_rate_limits
  where service = 'nominatim'
  for update;

  update rate_private.external_service_rate_limits
  set next_allowed_at = v_slot + interval '1100 milliseconds'
  where service = 'nominatim';

  return greatest(0, ceil(extract(epoch from (v_slot - v_now)) * 1000)::integer);
end;
$$;

revoke all on function public.reserve_nominatim_slot() from public, anon;
grant execute on function public.reserve_nominatim_slot() to authenticated;

drop table app_private.external_service_rate_limits;
