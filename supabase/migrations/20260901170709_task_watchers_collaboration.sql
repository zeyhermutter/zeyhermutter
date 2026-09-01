create or replace function app_private.guard_task_watcher_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_responsible uuid;
  v_archived_at timestamptz;
begin
  select t.responsible_user,t.archived_at into v_responsible,v_archived_at
  from public.tasks t where t.id=new.task_id;
  if not found or v_archived_at is not null then raise exception 'TASK_NOT_AVAILABLE' using errcode='P0002'; end if;
  if not exists(select 1 from public.profiles p where p.user_id=new.user_id and p.status='ACTIVE') then raise exception 'TASK_WATCHER_NOT_ACTIVE' using errcode='22023'; end if;
  if new.user_id=v_responsible then raise exception 'TASK_WATCHER_IS_RESPONSIBLE' using errcode='22023'; end if;
  return new;
end;
$function$;
revoke all on function app_private.guard_task_watcher_insert() from public,anon,authenticated;
drop trigger if exists task_watchers_guard_insert on public.task_watchers;
create trigger task_watchers_guard_insert before insert on public.task_watchers for each row execute function app_private.guard_task_watcher_insert();

create or replace function app_private.notify_task_watcher_added()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_actor uuid:=auth.uid();v_title text;v_number text;
begin
  if new.user_id=v_actor then return new; end if;
  if not exists(select 1 from public.profiles p where p.user_id=new.user_id and p.status='ACTIVE') then return new; end if;
  select t.title,t.task_number into v_title,v_number from public.tasks t where t.id=new.task_id;
  if v_title is null then return new; end if;
  insert into public.notifications(user_id,type,title,message,entity_type,entity_id)
  values(new.user_id,'TASK_WATCHER','Aufgabe wird beobachtet',v_number||' · '||v_title,'TASK',new.task_id);
  return new;
end;
$function$;
revoke all on function app_private.notify_task_watcher_added() from public,anon,authenticated;
drop trigger if exists task_watchers_notify_added on public.task_watchers;
create trigger task_watchers_notify_added after insert on public.task_watchers for each row execute function app_private.notify_task_watcher_added();

create or replace function app_private.notify_task_relevant_change()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_actor uuid:=auth.uid();v_recipient uuid;v_title text;v_message text;v_status_label text;v_parts text[]:='{}'::text[];
begin
  if new.responsible_user is distinct from old.responsible_user then
    delete from public.task_watchers tw where tw.task_id=new.id and tw.user_id=new.responsible_user;
  end if;
  if new.status is not distinct from old.status and new.due_at is not distinct from old.due_at and new.responsible_user is not distinct from old.responsible_user then return new; end if;
  if new.status is distinct from old.status then
    v_status_label:=case new.status when 'OPEN' then 'Offen' when 'IN_PROGRESS' then 'In Bearbeitung' when 'DONE' then 'Erledigt' when 'CANCELLED' then 'Abgebrochen' else new.status end;
    v_parts:=array_append(v_parts,'Status: '||v_status_label);
  end if;
  if new.due_at is distinct from old.due_at then v_parts:=array_append(v_parts,'Fälligkeit geändert'); end if;
  if new.responsible_user is distinct from old.responsible_user then v_parts:=array_append(v_parts,'Verantwortlichkeit geändert'); end if;
  v_title:=case when new.status='DONE' and new.status is distinct from old.status then 'Aufgabe abgeschlossen' else 'Aufgabe aktualisiert' end;
  v_message:=new.task_number||' · '||new.title||case when cardinality(v_parts)>0 then ' · '||array_to_string(v_parts,' · ') else '' end;
  for v_recipient in
    select distinct x.user_id
    from (
      select tw.user_id from public.task_watchers tw where tw.task_id=new.id
      union all select new.responsible_user
      union all select old.responsible_user where new.responsible_user is distinct from old.responsible_user
    ) x
    join public.profiles p on p.user_id=x.user_id and p.status='ACTIVE'
    where x.user_id is not null and x.user_id is distinct from v_actor
  loop
    insert into public.notifications(user_id,type,title,message,entity_type,entity_id)
    values(v_recipient,'TASK_UPDATED',v_title,v_message,'TASK',new.id);
  end loop;
  return new;
end;
$function$;
revoke all on function app_private.notify_task_relevant_change() from public,anon,authenticated;
drop trigger if exists tasks_notify_relevant_change on public.tasks;
create trigger tasks_notify_relevant_change after update of status,due_at,responsible_user on public.tasks for each row execute function app_private.notify_task_relevant_change();

create or replace function app_private.notify_task_created()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare v_actor uuid:=auth.uid();
begin
  if new.responsible_user is distinct from v_actor and exists(select 1 from public.profiles p where p.user_id=new.responsible_user and p.status='ACTIVE') then
    insert into public.notifications(user_id,type,title,message,entity_type,entity_id)
    values(new.responsible_user,'TASK_ASSIGNED','Neue Aufgabe zugewiesen',new.task_number||' · '||new.title,'TASK',new.id);
  end if;
  return new;
end;
$function$;
revoke all on function app_private.notify_task_created() from public,anon,authenticated;
drop trigger if exists tasks_notify_created on public.tasks;
create trigger tasks_notify_created after insert on public.tasks for each row execute function app_private.notify_task_created();

create or replace function public.create_task_comment(p_task_id uuid,p_body text,p_mentioned_user_ids uuid[] default '{}'::uuid[])
returns uuid
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_user uuid:=auth.uid();v_comment_id uuid;v_mentioned uuid;v_recipient uuid;v_task public.tasks%rowtype;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not app_private.has_permission('task.write') then raise exception 'TASK_WRITE_REQUIRED' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_body,'')),'') is null then raise exception 'COMMENT_REQUIRED' using errcode='22023'; end if;
  select * into v_task from public.tasks t where t.id=p_task_id and t.archived_at is null;
  if v_task.id is null then raise exception 'TASK_NOT_FOUND' using errcode='P0002'; end if;
  insert into public.comments(entity_type,entity_id,body,author_user_id) values('TASK',p_task_id,trim(p_body),v_user) returning id into v_comment_id;
  for v_mentioned in select distinct x from unnest(coalesce(p_mentioned_user_ids,'{}'::uuid[])) x where x<>v_user loop
    if exists(select 1 from public.profiles p where p.user_id=v_mentioned and p.status='ACTIVE') then
      insert into public.comment_mentions(comment_id,mentioned_user_id) values(v_comment_id,v_mentioned) on conflict do nothing;
    end if;
  end loop;
  for v_recipient in
    select distinct x.user_id
    from (select tw.user_id from public.task_watchers tw where tw.task_id=p_task_id union all select v_task.responsible_user) x
    join public.profiles p on p.user_id=x.user_id and p.status='ACTIVE'
    where x.user_id<>v_user and not exists(select 1 from public.comment_mentions cm where cm.comment_id=v_comment_id and cm.mentioned_user_id=x.user_id)
  loop
    insert into public.notifications(user_id,type,title,message,entity_type,entity_id)
    values(v_recipient,'TASK_COMMENT','Neuer Kommentar zu einer Aufgabe',v_task.task_number||' · '||left(trim(p_body),180),'TASK',p_task_id);
  end loop;
  return v_comment_id;
end;
$function$;
revoke all on function public.create_task_comment(uuid,text,uuid[]) from public,anon;
grant execute on function public.create_task_comment(uuid,text,uuid[]) to authenticated;
