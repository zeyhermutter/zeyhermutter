create trigger contact_relationships_audit
after insert or update or delete on public.contact_relationships
for each row execute function app_private.audit_row_change('CONTACT_RELATIONSHIP', '');

create trigger contact_organization_relationships_audit
after insert or update or delete on public.contact_organization_relationships
for each row execute function app_private.audit_row_change('CONTACT_ORGANIZATION_RELATIONSHIP', '');

create or replace function app_private.audit_contact_role_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_actor uuid := auth.uid();
  v_actor_name text;
  v_contact_id uuid;
  v_role_id uuid;
  v_role_key text;
  v_role_name text;
  v_changes jsonb;
begin
  if tg_op = 'DELETE' then
    v_contact_id := old.contact_id;
    v_role_id := old.role_id;
  else
    v_contact_id := new.contact_id;
    v_role_id := new.role_id;
  end if;

  if v_actor is not null then
    select p.display_name into v_actor_name
    from public.profiles p
    where p.user_id = v_actor;
  end if;

  select r.key, r.name into v_role_key, v_role_name
  from public.contact_roles r
  where r.id = v_role_id;

  v_changes := jsonb_build_object(
    'role', jsonb_build_object(
      'old', case when tg_op = 'DELETE' then jsonb_build_object('id', v_role_id, 'key', v_role_key, 'name', v_role_name) else null end,
      'new', case when tg_op = 'INSERT' then jsonb_build_object('id', v_role_id, 'key', v_role_key, 'name', v_role_name) else null end
    )
  );

  insert into public.audit_events (
    actor_type, actor_user_id, actor_display_name_snapshot,
    entity_type, entity_id, entity_reference,
    action, field_changes, source, metadata
  )
  select
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    v_actor,
    coalesce(v_actor_name, case when v_actor is null then 'System' else 'Benutzer' end),
    'CONTACT',
    v_contact_id,
    c.contact_number,
    'UPDATE',
    v_changes,
    case when v_actor is null then 'SYSTEM' else 'USER' end,
    jsonb_build_object('change_type', 'CONTACT_ROLE_ASSIGNMENT', 'operation', tg_op)
  from public.contacts c
  where c.id = v_contact_id;

  return coalesce(new, old);
end;
$$;

revoke all on function app_private.audit_contact_role_assignment() from public;

create trigger contact_role_assignments_audit
after insert or delete on public.contact_role_assignments
for each row execute function app_private.audit_contact_role_assignment();
