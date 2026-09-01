create or replace function app_private.notify_task_comment_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_recipient uuid;
  v_task public.tasks%rowtype;
begin
  if new.entity_type<>'TASK' then return new; end if;
  select * into v_task from public.tasks t where t.id=new.entity_id and t.archived_at is null;
  if v_task.id is null then return new; end if;
  for v_recipient in
    select distinct x.user_id
    from (select tw.user_id from public.task_watchers tw where tw.task_id=v_task.id union all select v_task.responsible_user) x
    join public.profiles p on p.user_id=x.user_id and p.status='ACTIVE'
    where x.user_id<>new.author_user_id
  loop
    insert into public.notifications(user_id,type,title,message,entity_type,entity_id)
    values(v_recipient,'TASK_COMMENT','Neuer Kommentar zu einer Aufgabe',v_task.task_number||' · '||left(trim(new.body),180),'TASK',v_task.id);
  end loop;
  return new;
end;
$function$;
revoke all on function app_private.notify_task_comment_insert() from public,anon,authenticated;
drop trigger if exists comments_notify_task_followers on public.comments;
create trigger comments_notify_task_followers after insert on public.comments for each row when (new.entity_type='TASK') execute function app_private.notify_task_comment_insert();

create or replace function app_private.notify_comment_mention()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_comment public.comments%rowtype;
  v_target_active boolean;
begin
  select * into v_comment from public.comments where id=new.comment_id;
  if v_comment.id is null or v_comment.author_user_id=new.mentioned_user_id then return new; end if;
  select exists(select 1 from public.profiles p where p.user_id=new.mentioned_user_id and p.status='ACTIVE') into v_target_active;
  if not v_target_active then return new; end if;
  if v_comment.entity_type='TASK' and exists(
    select 1 from public.tasks t where t.id=v_comment.entity_id and t.responsible_user=new.mentioned_user_id
    union all
    select 1 from public.task_watchers tw where tw.task_id=v_comment.entity_id and tw.user_id=new.mentioned_user_id
  ) then return new; end if;
  insert into public.notifications(user_id,type,title,message,entity_type,entity_id)
  values(new.mentioned_user_id,'MENTION',case when v_comment.entity_type='CONTACT' then 'Du wurdest in einem Kontakt erwähnt' else 'Du wurdest erwähnt' end,left(v_comment.body,240),v_comment.entity_type,v_comment.entity_id);
  return new;
end;
$function$;

create or replace function public.create_task_comment(p_task_id uuid,p_body text,p_mentioned_user_ids uuid[] default '{}'::uuid[])
returns uuid
language plpgsql
set search_path to 'public','pg_temp'
as $function$
declare v_user uuid:=auth.uid();v_comment_id uuid;v_mentioned uuid;
begin
  if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
  if not app_private.has_permission('task.write') then raise exception 'TASK_WRITE_REQUIRED' using errcode='42501'; end if;
  if nullif(trim(coalesce(p_body,'')),'') is null then raise exception 'COMMENT_REQUIRED' using errcode='22023'; end if;
  if not exists(select 1 from public.tasks t where t.id=p_task_id and t.archived_at is null) then raise exception 'TASK_NOT_FOUND' using errcode='P0002'; end if;
  insert into public.comments(entity_type,entity_id,body,author_user_id) values('TASK',p_task_id,trim(p_body),v_user) returning id into v_comment_id;
  for v_mentioned in select distinct x from unnest(coalesce(p_mentioned_user_ids,'{}'::uuid[])) x where x<>v_user loop
    if exists(select 1 from public.profiles p where p.user_id=v_mentioned and p.status='ACTIVE') then
      insert into public.comment_mentions(comment_id,mentioned_user_id) values(v_comment_id,v_mentioned) on conflict do nothing;
    end if;
  end loop;
  return v_comment_id;
end;
$function$;
revoke all on function public.create_task_comment(uuid,text,uuid[]) from public,anon;
grant execute on function public.create_task_comment(uuid,text,uuid[]) to authenticated;
