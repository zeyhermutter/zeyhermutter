create or replace function app_private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_old jsonb := '{}'::jsonb;
  v_new jsonb := '{}'::jsonb;
  v_changes jsonb := '{}'::jsonb;
  v_key text;
  v_action text;
  v_entity_reference text;
  v_row jsonb;
  v_source text;
begin
  if v_actor is not null then
    select p.display_name into v_actor_name from public.profiles p where p.user_id = v_actor;
    v_source := 'USER';
  else
    v_actor_name := 'System';
    v_source := 'SYSTEM';
  end if;

  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_row := v_new;
    v_action := 'CREATE';
    v_changes := jsonb_build_object('record', jsonb_build_object('old', null, 'new', v_new - array['created_at','updated_at','created_by','updated_by','version']));
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_row := v_new;

    for v_key in
      select key from (
        select key from jsonb_each(v_old)
        union
        select key from jsonb_each(v_new)
      ) k
      where key <> all(array['created_at','updated_at','created_by','updated_by','version'])
    loop
      if (v_old -> v_key) is distinct from (v_new -> v_key) then
        v_changes := v_changes || jsonb_build_object(v_key, jsonb_build_object('old', v_old -> v_key, 'new', v_new -> v_key));
      end if;
    end loop;

    if v_changes = '{}'::jsonb then return new; end if;

    if (v_old -> 'archived_at') = 'null'::jsonb and (v_new -> 'archived_at') is distinct from 'null'::jsonb then
      v_action := 'ARCHIVE';
    elsif (v_old -> 'archived_at') is distinct from 'null'::jsonb and (v_new -> 'archived_at') = 'null'::jsonb then
      v_action := 'RESTORE';
    elsif (v_old -> 'status') is distinct from (v_new -> 'status') then
      v_action := 'STATUS_CHANGE';
    else
      v_action := 'UPDATE';
    end if;
  elsif tg_op = 'DELETE' then
    v_old := to_jsonb(old);
    v_row := v_old;
    v_action := 'DELETE';
    v_changes := jsonb_build_object('record', jsonb_build_object('old', v_old - array['created_at','updated_at','created_by','updated_by','version'], 'new', null));
  else
    return coalesce(new, old);
  end if;

  if tg_nargs > 1 and tg_argv[1] is not null and tg_argv[1] <> '' then
    v_entity_reference := v_row ->> tg_argv[1];
  end if;

  insert into public.audit_events (actor_type, actor_user_id, actor_display_name_snapshot, entity_type, entity_id, entity_reference, action, field_changes, source)
  values (case when v_actor is null then 'SYSTEM' else 'USER' end, v_actor, v_actor_name, tg_argv[0], (v_row ->> 'id')::uuid, v_entity_reference, v_action, v_changes, v_source);

  return coalesce(new, old);
end;
$$;

revoke all on function app_private.audit_row_change() from public, anon, authenticated;

drop trigger if exists contact_addresses_audit on public.contact_addresses;

create or replace function app_private.audit_contact_address()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_row jsonb;
  v_contact_id uuid;
  v_contact_number text;
  v_changes jsonb;
  v_action text;
begin
  v_row := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
  v_contact_id := (v_row ->> 'contact_id')::uuid;
  select p.display_name into v_actor_name from public.profiles p where p.user_id = v_actor;
  select c.contact_number into v_contact_number from public.contacts c where c.id = v_contact_id;

  if tg_op = 'INSERT' then
    v_action := 'UPDATE';
    v_changes := jsonb_build_object('address', jsonb_build_object('old', null, 'new', v_row - array['created_at','updated_at','created_by','updated_by','version']));
  elsif tg_op = 'DELETE' then
    v_action := 'UPDATE';
    v_changes := jsonb_build_object('address', jsonb_build_object('old', v_row - array['created_at','updated_at','created_by','updated_by','version'], 'new', null));
  else
    if old.archived_at is null and new.archived_at is not null then v_action := 'ARCHIVE';
    elsif old.archived_at is not null and new.archived_at is null then v_action := 'RESTORE';
    else v_action := 'UPDATE'; end if;
    v_changes := jsonb_build_object('address', jsonb_build_object('old', to_jsonb(old) - array['created_at','updated_at','created_by','updated_by','version'], 'new', to_jsonb(new) - array['created_at','updated_at','created_by','updated_by','version']));
  end if;

  insert into public.audit_events (actor_type, actor_user_id, actor_display_name_snapshot, entity_type, entity_id, entity_reference, action, field_changes, source, metadata)
  values (case when v_actor is null then 'SYSTEM' else 'USER' end, v_actor, coalesce(v_actor_name, case when v_actor is null then 'System' else 'Benutzer' end), 'CONTACT', v_contact_id, v_contact_number, v_action, v_changes, case when v_actor is null then 'SYSTEM' else 'USER' end, jsonb_build_object('change_type','CONTACT_ADDRESS','address_id',v_row ->> 'id'));

  return coalesce(new, old);
end;
$$;

revoke all on function app_private.audit_contact_address() from public, anon, authenticated;

create trigger contact_addresses_audit
after insert or update or delete on public.contact_addresses
for each row execute function app_private.audit_contact_address();

create or replace function public.find_contact_duplicates(
  p_first_name text, p_last_name text, p_email text default null, p_mobile text default null,
  p_street text default null, p_house_number text default null, p_postal_code text default null,
  p_city text default null, p_exclude_contact_id uuid default null
)
returns table (contact_id uuid, contact_number text, first_name text, last_name text, email text, mobile text, reasons text[])
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with candidates as (
    select c.id, c.contact_number, c.first_name, c.last_name, c.email, c.mobile,
      array_remove(array[
        case when nullif(trim(p_email),'') is not null and lower(trim(coalesce(c.email,''))) = lower(trim(p_email)) then 'EMAIL' end,
        case when nullif(regexp_replace(coalesce(p_mobile,''),'\D','','g'),'') is not null and regexp_replace(coalesce(c.mobile,''),'\D','','g') = regexp_replace(p_mobile,'\D','','g') then 'MOBILE' end,
        case when lower(trim(c.first_name)) = lower(trim(coalesce(p_first_name,''))) and lower(trim(c.last_name)) = lower(trim(coalesce(p_last_name,''))) and nullif(trim(p_postal_code),'') is not null and exists (
          select 1 from public.contact_addresses a where a.contact_id = c.id and a.archived_at is null and lower(trim(a.postal_code)) = lower(trim(p_postal_code)) and lower(trim(a.city)) = lower(trim(coalesce(p_city,''))) and lower(trim(a.street)) = lower(trim(coalesce(p_street,''))) and lower(trim(coalesce(a.house_number,''))) = lower(trim(coalesce(p_house_number,'')))
        ) then 'NAME_ADDRESS' end,
        case when lower(trim(c.first_name)) = lower(trim(coalesce(p_first_name,''))) and lower(trim(c.last_name)) = lower(trim(coalesce(p_last_name,''))) then 'NAME' end
      ], null) as match_reasons
    from public.contacts c
    where c.archived_at is null and (p_exclude_contact_id is null or c.id <> p_exclude_contact_id)
  )
  select id, contact_number, first_name, last_name, email, mobile, match_reasons
  from candidates
  where cardinality(match_reasons) > 0 and ('EMAIL' = any(match_reasons) or 'MOBILE' = any(match_reasons) or 'NAME_ADDRESS' = any(match_reasons))
  order by contact_number
  limit 10;
$$;

revoke all on function public.find_contact_duplicates(text,text,text,text,text,text,text,text,uuid) from public, anon;
grant execute on function public.find_contact_duplicates(text,text,text,text,text,text,text,text,uuid) to authenticated;
