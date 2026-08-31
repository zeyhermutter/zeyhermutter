create or replace function app_private.guard_converted_lead_business_data()
returns trigger
language plpgsql
set search_path = public, app_private, pg_temp
as $$
begin
  if old.converted_property_id is not null then
    if (to_jsonb(new) - array['archived_at','archived_by','updated_at','updated_by','version'])
       is distinct from
       (to_jsonb(old) - array['archived_at','archived_by','updated_at','updated_by','version']) then
      raise exception 'CONVERTED_LEAD_READ_ONLY' using errcode='22023';
    end if;
    return new;
  end if;

  if new.converted_property_id is not null
     and coalesce(current_setting('app.lead_conversion', true), '') <> '1' then
    raise exception 'LEAD_CONVERSION_RPC_REQUIRED' using errcode='42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_converted_lead_business_data on public.leads;
create trigger trg_guard_converted_lead_business_data
before update on public.leads
for each row execute function app_private.guard_converted_lead_business_data();
