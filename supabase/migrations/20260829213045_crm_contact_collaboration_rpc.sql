create or replace function public.create_contact_comment(
  p_contact_id uuid,
  p_body text,
  p_mentioned_user_ids uuid[] default '{}'::uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user uuid := auth.uid();
  v_comment_id uuid;
  v_mentioned uuid;
  v_contact_ref text;
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

  select c.contact_number into v_contact_ref
  from public.contacts c
  where c.id = p_contact_id and c.archived_at is null;

  if v_contact_ref is null then
    raise exception 'CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;

  insert into public.comments(entity_type, entity_id, body, author_user_id)
  values ('CONTACT', p_contact_id, trim(p_body), v_user)
  returning id into v_comment_id;

  for v_mentioned in
    select distinct x
    from unnest(coalesce(p_mentioned_user_ids, '{}'::uuid[])) x
    join public.profiles p on p.user_id = x and p.status = 'ACTIVE'
    where x <> v_user
  loop
    insert into public.comment_mentions(comment_id, mentioned_user_id)
    values (v_comment_id, v_mentioned)
    on conflict do nothing;

    insert into public.notifications(user_id, type, title, message, entity_type, entity_id)
    values (
      v_mentioned,
      'MENTION',
      'Du wurdest in einem Kontakt erwähnt',
      left(trim(p_body), 240),
      'CONTACT',
      p_contact_id
    );
  end loop;

  return v_comment_id;
end;
$$;

revoke all on function public.create_contact_comment(uuid,text,uuid[]) from public, anon;
grant execute on function public.create_contact_comment(uuid,text,uuid[]) to authenticated;

comment on function public.create_contact_comment(uuid,text,uuid[]) is 'Atomare Kontakt-Kommentare mit validierten Mentions und Notifications. SECURITY DEFINER ist eng begrenzt und prüft contact.write explizit.';
