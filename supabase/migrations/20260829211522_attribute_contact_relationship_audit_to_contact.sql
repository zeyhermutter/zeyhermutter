drop trigger if exists contact_relationships_audit on public.contact_relationships;
drop trigger if exists contact_organization_relationships_audit on public.contact_organization_relationships;

create or replace function app_private.audit_contact_relation()
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
  v_changes jsonb;
  v_operation text := tg_op;
  v_contact_number text;
begin
  if tg_op = 'DELETE' then
    v_row := to_jsonb(old);
  else
    v_row := to_jsonb(new);
  end if;

  v_contact_id := (v_row ->> 'contact_id')::uuid;
  select p.display_name into v_actor_name from public.profiles p where p.user_id = v_actor;
  select c.contact_number into v_contact_number from public.contacts c where c.id = v_contact_id;

  if tg_op = 'INSERT' then
    v_changes := jsonb_build_object(
      'relationship', jsonb_build_object('old', null, 'new', v_row - array['created_at','created_by'])
    );
  elsif tg_op = 'UPDATE' then
    v_changes := jsonb_build_object(
      'relationship', jsonb_build_object('old', to_jsonb(old) - array['created_at','created_by'], 'new', to_jsonb(new) - array['created_at','created_by'])
    );
  else
    v_changes := jsonb_build_object(
      'relationship', jsonb_build_object('old', v_row - array['created_at','created_by'], 'new', null)
    );
  end if;

  insert into public.audit_events (
    actor_type, actor_user_id, actor_display_name_snapshot,
    entity_type, entity_id, entity_reference,
    action, field_changes, source, metadata
  ) values (
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    v_actor,
    coalesce(v_actor_name, case when v_actor is null then 'System' else 'Benutzer' end),
    'CONTACT',
    v_contact_id,
    v_contact_number,
    'UPDATE',
    v_changes,
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    jsonb_build_object('change_type', tg_argv[0], 'operation', v_operation, 'relation_id', v_row ->> 'id')
  );

  return coalesce(new, old);
end;
$$;

revoke all on function app_private.audit_contact_relation() from public;

create trigger contact_relationships_audit
after insert or update or delete on public.contact_relationships
for each row execute function app_private.audit_contact_relation('CONTACT_RELATIONSHIP');

create trigger contact_organization_relationships_audit
after insert or update or delete on public.contact_organization_relationships
for each row execute function app_private.audit_contact_relation('CONTACT_ORGANIZATION_RELATIONSHIP');
