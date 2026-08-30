create or replace function app_private.manage_property_checklist_completion()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.status = 'DONE' then
    if tg_op = 'INSERT' or old.status is distinct from 'DONE' then
      new.completed_at := now();
      new.completed_by := auth.uid();
    else
      new.completed_at := old.completed_at;
      new.completed_by := old.completed_by;
    end if;
  else
    new.completed_at := null;
    new.completed_by := null;
  end if;
  return new;
end;
$$;
revoke all on function app_private.manage_property_checklist_completion() from public;

drop trigger if exists property_checklist_manage_completion on public.property_marketing_checklist_items;
create trigger property_checklist_manage_completion
before insert or update of status, completed_at, completed_by
on public.property_marketing_checklist_items
for each row execute function app_private.manage_property_checklist_completion();

alter table public.property_marketing_checklist_items
  drop constraint if exists property_marketing_checklist_items_check;

alter table public.property_marketing_checklist_items
  add constraint property_checklist_completion_metadata_check
  check (
    (status = 'DONE' and completed_at is not null and completed_by is not null)
    or
    (status <> 'DONE' and completed_at is null and completed_by is null)
  );
