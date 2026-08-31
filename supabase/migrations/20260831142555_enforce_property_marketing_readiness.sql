create or replace function app_private.enforce_property_sensitive_permissions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_missing text[] := '{}'::text[];
  v_open_checklist text;
begin
  if old.primary_responsible_user is distinct from new.primary_responsible_user
     and not app_private.has_permission('property.assign') then
    raise exception 'PROPERTY_ASSIGN_REQUIRED' using errcode = '42501';
  end if;

  if (new.status = 'ARCHIVED' or old.status = 'ARCHIVED')
     and old.status is distinct from new.status
     and not app_private.has_permission('property.archive') then
    raise exception 'PROPERTY_ARCHIVE_REQUIRED' using errcode = '42501';
  end if;

  if old.status = 'PREPARATION' and new.status = 'MARKETING' then
    if not app_private.has_permission('property.publish') then
      raise exception 'PROPERTY_PUBLISH_REQUIRED' using errcode = '42501';
    end if;

    if new.primary_responsible_user is null then
      v_missing := array_append(v_missing, 'verantwortlicher Benutzer');
    end if;

    if not exists (
      select 1
      from public.property_owners owner
      where owner.property_id = new.id
        and coalesce(owner.valid_from, current_date) <= current_date
        and (owner.valid_until is null or owner.valid_until >= current_date)
    ) then
      v_missing := array_append(v_missing, 'aktiver Eigentümer');
    end if;

    if not exists (
      select 1
      from public.property_addresses address
      where address.property_id = new.id
        and nullif(trim(address.street), '') is not null
        and nullif(trim(address.house_number), '') is not null
        and nullif(trim(address.postal_code), '') is not null
        and nullif(trim(address.city), '') is not null
    ) then
      v_missing := array_append(v_missing, 'vollständige Objektadresse');
    end if;

    if new.transaction_type = 'SALE' and coalesce(new.purchase_price, 0) <= 0 then
      v_missing := array_append(v_missing, 'positiver Kaufpreis');
    elsif new.transaction_type = 'RENT' and coalesce(new.rent_cold, 0) <= 0 then
      v_missing := array_append(v_missing, 'positive Kaltmiete');
    end if;

    select string_agg(item.title, ', ' order by item.category, item.title)
      into v_open_checklist
    from public.property_marketing_checklist_items item
    where item.property_id = new.id
      and item.required
      and item.status not in ('DONE', 'WAIVED');

    if v_open_checklist is not null then
      v_missing := array_append(v_missing, 'offene Pflicht-Checkliste: ' || v_open_checklist);
    end if;

    if cardinality(v_missing) > 0 then
      raise exception 'PROPERTY_MARKETING_NOT_READY'
        using errcode = '22023', detail = array_to_string(v_missing, '; ');
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_property_sensitive_permissions() from public, anon, authenticated;
