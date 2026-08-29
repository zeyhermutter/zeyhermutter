insert into public.permissions(key,description) values
  ('organization.archive','Organisationen archivieren'),
  ('task.archive','Aufgaben archivieren')
on conflict(key) do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in ('admin','managing_director') and p.key in ('organization.archive','task.archive')
on conflict do nothing;

create or replace function app_private.enforce_archive_permission()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.archived_at is distinct from new.archived_at then
    if not app_private.has_permission(tg_argv[0]) then raise exception 'missing archive permission: %', tg_argv[0]; end if;
  end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_archive_permission() from public;

drop trigger if exists contacts_enforce_archive_permission on public.contacts;
create trigger contacts_enforce_archive_permission before update on public.contacts for each row execute function app_private.enforce_archive_permission('contact.archive');
drop trigger if exists organizations_enforce_archive_permission on public.organizations;
create trigger organizations_enforce_archive_permission before update on public.organizations for each row execute function app_private.enforce_archive_permission('organization.archive');
drop trigger if exists tasks_enforce_archive_permission on public.tasks;
create trigger tasks_enforce_archive_permission before update on public.tasks for each row execute function app_private.enforce_archive_permission('task.archive');
drop trigger if exists documents_enforce_archive_permission on public.documents;
create trigger documents_enforce_archive_permission before update on public.documents for each row execute function app_private.enforce_archive_permission('document.archive');

create or replace function app_private.enforce_property_sensitive_permissions()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.primary_responsible_user is distinct from new.primary_responsible_user and not app_private.has_permission('property.assign') then raise exception 'missing property.assign permission'; end if;
  if (new.status='ARCHIVED' or old.status='ARCHIVED') and old.status is distinct from new.status and not app_private.has_permission('property.archive') then raise exception 'missing property.archive permission'; end if;
  if old.status='PREPARATION' and new.status='MARKETING' and not app_private.has_permission('property.publish') then raise exception 'missing property.publish permission'; end if;
  return new;
end;
$$;
revoke all on function app_private.enforce_property_sensitive_permissions() from public;

drop trigger if exists properties_enforce_sensitive_permissions on public.properties;
create trigger properties_enforce_sensitive_permissions before update on public.properties for each row execute function app_private.enforce_property_sensitive_permissions();