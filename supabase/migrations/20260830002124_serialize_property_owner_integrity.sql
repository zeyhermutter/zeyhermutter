create or replace function app_private.validate_property_ownership_total()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_total numeric;
  v_primary_count integer;
begin
  if tg_op = 'UPDATE' and (
    old.property_id is distinct from new.property_id
    or old.contact_id is distinct from new.contact_id
  ) then
    raise exception 'property owner relation identity is immutable; remove and recreate the relation';
  end if;

  perform 1
  from public.properties
  where id = new.property_id
  for update;

  select
    coalesce(sum(po.ownership_percentage), 0),
    count(*) filter (where po.primary_contact)
  into v_total, v_primary_count
  from public.property_owners po
  where po.property_id = new.property_id
    and po.id is distinct from new.id
    and (po.valid_from is null or po.valid_from <= current_date)
    and (po.valid_until is null or po.valid_until >= current_date);

  if (new.valid_from is null or new.valid_from <= current_date)
     and (new.valid_until is null or new.valid_until >= current_date) then
    v_total := v_total + coalesce(new.ownership_percentage, 0);
    if new.primary_contact then
      v_primary_count := v_primary_count + 1;
    end if;
  end if;

  if v_total > 100.00 then
    raise exception 'active ownership percentages exceed 100%%';
  end if;

  if v_primary_count > 1 then
    raise exception 'only one active primary owner contact is allowed per property';
  end if;

  return new;
end;
$$;
revoke all on function app_private.validate_property_ownership_total() from public;

drop trigger if exists property_owners_validate_total on public.property_owners;
create trigger property_owners_validate_total
before insert or update on public.property_owners
for each row execute function app_private.validate_property_ownership_total();
