create or replace function app_private.notify_comment_mention()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_comment public.comments%rowtype;
  v_target_active boolean;
begin
  select * into v_comment
  from public.comments
  where id = new.comment_id;

  if v_comment.id is null or v_comment.author_user_id = new.mentioned_user_id then
    return new;
  end if;

  select exists(
    select 1 from public.profiles p
    where p.user_id = new.mentioned_user_id and p.status = 'ACTIVE'
  ) into v_target_active;

  if not v_target_active then
    return new;
  end if;

  insert into public.notifications(user_id, type, title, message, entity_type, entity_id)
  values (
    new.mentioned_user_id,
    'MENTION',
    case when v_comment.entity_type = 'CONTACT' then 'Du wurdest in einem Kontakt erwähnt' else 'Du wurdest erwähnt' end,
    left(v_comment.body, 240),
    v_comment.entity_type,
    v_comment.entity_id
  );

  return new;
end;
$$;

revoke all on function app_private.notify_comment_mention() from public, anon, authenticated;

drop trigger if exists comment_mentions_notify on public.comment_mentions;
create trigger comment_mentions_notify
after insert on public.comment_mentions
for each row execute function app_private.notify_comment_mention();

create or replace function public.create_contact_comment(
  p_contact_id uuid,
  p_body text,
  p_mentioned_user_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_comment_id uuid;
  v_mentioned uuid;
begin
  if v_user is null then
    raise exception 'AUTH_REQUIRED' using errcode = '42501';
  end if;
  if not app_private.has_permission('contact.write') then
    raise exception 'CONTACT_WRITE_REQUIRED' using errcode = '42501';
  end if;
  if nullif(trim(coalesce(p_body,'')),'') is null then
    raise exception 'COMMENT_REQUIRED' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.contacts c
    where c.id = p_contact_id and c.archived_at is null
  ) then
    raise exception 'CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.comments(entity_type, entity_id, body, author_user_id)
  values ('CONTACT', p_contact_id, trim(p_body), v_user)
  returning id into v_comment_id;

  for v_mentioned in
    select distinct x
    from unnest(coalesce(p_mentioned_user_ids, '{}'::uuid[])) x
    where x <> v_user
  loop
    insert into public.comment_mentions(comment_id, mentioned_user_id)
    values (v_comment_id, v_mentioned)
    on conflict do nothing;
  end loop;

  return v_comment_id;
end;
$$;

revoke all on function public.create_contact_comment(uuid,text,uuid[]) from public, anon;
grant execute on function public.create_contact_comment(uuid,text,uuid[]) to authenticated;

comment on function public.create_contact_comment(uuid,text,uuid[]) is 'Atomare Kontakt-Kommentare und Mentions im aufrufenden RLS-Kontext; Notifications werden durch privaten Trigger erzeugt.';
