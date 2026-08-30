create or replace function app_private.assign_document_version_number()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_next integer;
begin
  select current_version + 1
  into v_next
  from public.documents
  where id = new.document_id
  for update;

  if v_next is null then
    raise exception 'document not found';
  end if;

  new.version_number := v_next;

  perform set_config('app.document_version_bump', '1', true);
  update public.documents
  set current_version = v_next
  where id = new.document_id;
  perform set_config('app.document_version_bump', '0', true);

  return new;
end;
$$;
revoke all on function app_private.assign_document_version_number() from public;

create or replace function app_private.guard_document_current_version()
returns trigger
language plpgsql
set search_path = pg_catalog, pg_temp
as $$
begin
  if old.current_version is distinct from new.current_version
     and current_setting('app.document_version_bump', true) is distinct from '1' then
    raise exception 'document current_version is system managed';
  end if;
  return new;
end;
$$;
revoke all on function app_private.guard_document_current_version() from public;

drop trigger if exists documents_guard_current_version on public.documents;
create trigger documents_guard_current_version
before update on public.documents
for each row execute function app_private.guard_document_current_version();
