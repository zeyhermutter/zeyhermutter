-- Die Beteiligten haengen an der Verfuegungsakte, nicht direkt an der Immobilie.
-- app_private.audit_property_child liest property_id aus der Zeile und kann sie
-- deshalb nicht verwenden. Diese Variante loest die Immobilie ueber die Akte auf,
-- damit Aenderungen an Zustimmungen und Genehmigungen in der Objekthistorie stehen.
create or replace function app_private.audit_disposition_party()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_row jsonb;
  v_property_id uuid;
  v_property_number text;
  v_changes jsonb;
  v_strip text[] := array['created_at','updated_at','created_by','updated_by','version'];
begin
  v_row := case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end;
  select d.property_id into v_property_id
  from public.property_dispositions d
  where d.id = (v_row->>'disposition_id')::uuid;

  select display_name into v_actor_name from public.profiles where user_id = v_actor;
  select property_number into v_property_number from public.properties where id = v_property_id;

  if tg_op='INSERT' then
    v_changes := jsonb_build_object('DISPOSITION_PARTY', jsonb_build_object('old', null, 'new', v_row - v_strip));
  elsif tg_op='DELETE' then
    v_changes := jsonb_build_object('DISPOSITION_PARTY', jsonb_build_object('old', v_row - v_strip, 'new', null));
  else
    v_changes := jsonb_build_object('DISPOSITION_PARTY', jsonb_build_object('old', to_jsonb(old) - v_strip, 'new', to_jsonb(new) - v_strip));
  end if;

  insert into public.audit_events(actor_type,actor_user_id,actor_display_name_snapshot,entity_type,entity_id,entity_reference,action,field_changes,source,metadata)
  values(
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    v_actor, coalesce(v_actor_name,'System'),
    'PROPERTY', v_property_id, v_property_number, 'UPDATE', v_changes,
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    jsonb_build_object('change_type','DISPOSITION_PARTY','operation',tg_op)
  );
  return coalesce(new,old);
end;
$function$;

revoke all on function app_private.audit_disposition_party() from public, anon, authenticated;

drop trigger if exists property_disposition_parties_90_audit on public.property_disposition_parties;
create trigger property_disposition_parties_90_audit
after insert or update or delete on public.property_disposition_parties
for each row execute function app_private.audit_disposition_party();
