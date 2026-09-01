create or replace function app_private.manage_profile_status(
  p_target_user_id uuid,
  p_status text,
  p_expected_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_actor_name text;
  v_target_name text;
  v_old_status text;
  v_version bigint;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if not app_private.has_permission('user.manage') then
    raise exception 'USER_MANAGE_REQUIRED' using errcode='42501';
  end if;
  if p_target_user_id = v_actor then
    raise exception 'SELF_USER_STATUS_CHANGE_FORBIDDEN' using errcode='42501';
  end if;
  if p_status not in ('ACTIVE','DISABLED') then
    raise exception 'INVALID_MANAGED_PROFILE_STATUS' using errcode='22023';
  end if;

  select p.display_name,p.status,p.version
    into v_target_name,v_old_status,v_version
  from public.profiles p
  where p.user_id=p_target_user_id
  for update;

  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode='P0002';
  end if;
  if v_version <> p_expected_version then
    raise exception 'CONCURRENT_UPDATE' using errcode='40001';
  end if;
  if v_old_status = p_status then
    return v_version;
  end if;

  update public.profiles
  set status=p_status
  where user_id=p_target_user_id
  returning version into v_version;

  select p.display_name into v_actor_name from public.profiles p where p.user_id=v_actor;
  insert into public.audit_events(
    actor_type,actor_user_id,actor_display_name_snapshot,
    entity_type,entity_id,entity_reference,action,field_changes,source,metadata
  ) values (
    'USER',v_actor,coalesce(v_actor_name,'Benutzer'),
    'USER',p_target_user_id,v_target_name,'STATUS_CHANGE',
    jsonb_build_object('status',jsonb_build_object('old',v_old_status,'new',p_status)),
    'USER',jsonb_build_object('change_type','USER_PROFILE_STATUS')
  );

  return v_version;
end;
$function$;

revoke all on function app_private.manage_profile_status(uuid,text,bigint) from public,anon,authenticated;
grant execute on function app_private.manage_profile_status(uuid,text,bigint) to authenticated;

create or replace function app_private.manage_user_role(
  p_target_user_id uuid,
  p_role_id uuid,
  p_assign boolean,
  p_expected_profile_version bigint
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_actor uuid := (select auth.uid());
  v_actor_name text;
  v_target_name text;
  v_role_key text;
  v_role_name text;
  v_version bigint;
  v_active boolean;
  v_actor_is_admin boolean;
begin
  if v_actor is null then
    raise exception 'AUTH_REQUIRED' using errcode='42501';
  end if;
  if not app_private.has_permission('permission.manage') then
    raise exception 'PERMISSION_MANAGE_REQUIRED' using errcode='42501';
  end if;
  if p_target_user_id = v_actor then
    raise exception 'SELF_ROLE_CHANGE_FORBIDDEN' using errcode='42501';
  end if;

  select p.display_name,p.version
    into v_target_name,v_version
  from public.profiles p
  where p.user_id=p_target_user_id
  for update;
  if not found then
    raise exception 'PROFILE_NOT_FOUND' using errcode='P0002';
  end if;
  if v_version <> p_expected_profile_version then
    raise exception 'CONCURRENT_UPDATE' using errcode='40001';
  end if;

  select r.key,r.name into v_role_key,v_role_name
  from public.roles r where r.id=p_role_id;
  if not found then
    raise exception 'ROLE_NOT_FOUND' using errcode='P0002';
  end if;

  select exists(
    select 1 from public.user_roles ur
    join public.roles r on r.id=ur.role_id
    where ur.user_id=v_actor and ur.revoked_at is null and r.key='admin'
  ) into v_actor_is_admin;

  if v_role_key='admin' and not v_actor_is_admin then
    raise exception 'ADMIN_ROLE_REQUIRES_ADMIN_ACTOR' using errcode='42501';
  end if;

  select exists(
    select 1 from public.user_roles ur
    where ur.user_id=p_target_user_id and ur.role_id=p_role_id and ur.revoked_at is null
  ) into v_active;

  if p_assign then
    if v_active then return v_version; end if;
    insert into public.user_roles(user_id,role_id,assigned_at,assigned_by,revoked_at,revoked_by)
    values(p_target_user_id,p_role_id,clock_timestamp(),v_actor,null,null)
    on conflict(user_id,role_id) do update set
      assigned_at=excluded.assigned_at,
      assigned_by=excluded.assigned_by,
      revoked_at=null,
      revoked_by=null;
  else
    if not v_active then return v_version; end if;
    update public.user_roles
    set revoked_at=clock_timestamp(),revoked_by=v_actor
    where user_id=p_target_user_id and role_id=p_role_id and revoked_at is null;
  end if;

  update public.profiles set updated_at=clock_timestamp() where user_id=p_target_user_id
  returning version into v_version;

  select p.display_name into v_actor_name from public.profiles p where p.user_id=v_actor;
  insert into public.audit_events(
    actor_type,actor_user_id,actor_display_name_snapshot,
    entity_type,entity_id,entity_reference,action,field_changes,source,metadata
  ) values (
    'USER',v_actor,coalesce(v_actor_name,'Benutzer'),
    'USER',p_target_user_id,v_target_name,'UPDATE',
    jsonb_build_object('role',jsonb_build_object(
      'old',case when p_assign then null else jsonb_build_object('id',p_role_id,'key',v_role_key,'name',v_role_name) end,
      'new',case when p_assign then jsonb_build_object('id',p_role_id,'key',v_role_key,'name',v_role_name) else null end
    )),
    'USER',jsonb_build_object('change_type','USER_ROLE_ASSIGNMENT','operation',case when p_assign then 'ASSIGN' else 'REVOKE' end)
  );

  return v_version;
end;
$function$;

revoke all on function app_private.manage_user_role(uuid,uuid,boolean,bigint) from public,anon,authenticated;
grant execute on function app_private.manage_user_role(uuid,uuid,boolean,bigint) to authenticated;

create or replace function public.manage_profile_status(
  p_target_user_id uuid,
  p_status text,
  p_expected_version bigint
)
returns bigint
language sql
security invoker
set search_path = ''
as $function$
  select app_private.manage_profile_status(p_target_user_id,p_status,p_expected_version);
$function$;
revoke all on function public.manage_profile_status(uuid,text,bigint) from public,anon;
grant execute on function public.manage_profile_status(uuid,text,bigint) to authenticated;

create or replace function public.manage_user_role(
  p_target_user_id uuid,
  p_role_id uuid,
  p_assign boolean,
  p_expected_profile_version bigint
)
returns bigint
language sql
security invoker
set search_path = ''
as $function$
  select app_private.manage_user_role(p_target_user_id,p_role_id,p_assign,p_expected_profile_version);
$function$;
revoke all on function public.manage_user_role(uuid,uuid,boolean,bigint) from public,anon;
grant execute on function public.manage_user_role(uuid,uuid,boolean,bigint) to authenticated;

comment on function public.manage_profile_status(uuid,text,bigint) is 'Narrow audited profile status administration. Self-status changes are forbidden.';
comment on function public.manage_user_role(uuid,uuid,boolean,bigint) is 'Narrow audited role assignment administration. Requires permission.manage and forbids self-escalation.';
