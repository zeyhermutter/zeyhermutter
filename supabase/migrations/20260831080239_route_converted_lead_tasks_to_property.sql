create or replace function app_private.guard_converted_lead_task_target()
returns trigger
language plpgsql
set search_path = public, app_private, pg_temp
as $$
declare
  v_property_id uuid;
begin
  if new.lead_id is null then
    return new;
  end if;

  select converted_property_id into v_property_id
  from public.leads
  where id = new.lead_id;

  if v_property_id is not null and new.property_id is distinct from v_property_id then
    raise exception 'CONVERTED_LEAD_TASK_MUST_TARGET_PROPERTY' using errcode='22023';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_converted_lead_task_target on public.tasks;
create trigger trg_guard_converted_lead_task_target
before insert or update of lead_id, property_id on public.tasks
for each row execute function app_private.guard_converted_lead_task_target();
