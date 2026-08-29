create extension if not exists pg_trgm with schema extensions;

insert into public.permissions (key, description) values
  ('organization.archive','Organisationen archivieren und wiederherstellen'),
  ('task.archive','Aufgaben archivieren und wiederherstellen')
on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where r.key = 'admin'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('organization.archive','task.archive')
where r.key = 'managing_director'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'task.archive'
where r.key in ('agent','assistance')
on conflict do nothing;

create table public.contact_addresses (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.contacts(id) on delete cascade,
  address_type text not null default 'PRIMARY' check (address_type in ('PRIMARY','PRIVATE','BUSINESS','CORRESPONDENCE','OTHER')),
  street text not null,
  house_number text,
  postal_code text not null,
  city text not null,
  state text,
  country text not null default 'DE',
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1 check (version > 0)
);

create unique index contact_addresses_one_primary_idx
  on public.contact_addresses(contact_id)
  where is_primary and archived_at is null;
create index contact_addresses_contact_idx on public.contact_addresses(contact_id, archived_at);
create index contact_addresses_lookup_idx on public.contact_addresses using gin ((lower(coalesce(street,'') || ' ' || coalesce(house_number,'') || ' ' || postal_code || ' ' || city)) extensions.gin_trgm_ops);

create trigger contact_addresses_set_update_metadata
before update on public.contact_addresses
for each row execute function app_private.set_business_update_metadata();

create trigger contact_addresses_audit
after insert or update or delete on public.contact_addresses
for each row execute function app_private.audit_row_change('CONTACT_ADDRESS', 'id');

alter table public.contact_addresses enable row level security;

create policy contact_addresses_select on public.contact_addresses
for select to authenticated
using (app_private.has_permission('contact.read'));

create policy contact_addresses_insert on public.contact_addresses
for insert to authenticated
with check (app_private.has_permission('contact.write') and created_by = auth.uid());

create policy contact_addresses_update on public.contact_addresses
for update to authenticated
using (app_private.has_permission('contact.write'))
with check (app_private.has_permission('contact.write'));

create policy contact_addresses_delete on public.contact_addresses
for delete to authenticated
using (app_private.has_permission('contact.write'));

create or replace function app_private.enforce_archive_permission()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_permission text := tg_argv[0];
begin
  if old.archived_at is distinct from new.archived_at then
    if auth.uid() is null or not app_private.has_permission(v_permission) then
      raise exception 'ARCHIVE_PERMISSION_REQUIRED' using errcode = '42501';
    end if;
    if new.archived_at is not null then
      new.archived_by := auth.uid();
    else
      new.archived_by := null;
    end if;
  end if;
  return new;
end;
$$;

revoke all on function app_private.enforce_archive_permission() from public, anon, authenticated;

drop trigger if exists contacts_archive_guard on public.contacts;
create trigger contacts_archive_guard
before update on public.contacts
for each row execute function app_private.enforce_archive_permission('contact.archive');

drop trigger if exists organizations_archive_guard on public.organizations;
create trigger organizations_archive_guard
before update on public.organizations
for each row execute function app_private.enforce_archive_permission('organization.archive');

drop trigger if exists tasks_archive_guard on public.tasks;
create trigger tasks_archive_guard
before update on public.tasks
for each row execute function app_private.enforce_archive_permission('task.archive');

create index if not exists contacts_name_trgm_idx on public.contacts using gin ((lower(first_name || ' ' || last_name)) extensions.gin_trgm_ops);
create index if not exists contacts_email_trgm_idx on public.contacts using gin ((lower(coalesce(email,''))) extensions.gin_trgm_ops);
create index if not exists contacts_mobile_trgm_idx on public.contacts using gin ((lower(coalesce(mobile,''))) extensions.gin_trgm_ops);
create index if not exists organizations_name_trgm_idx on public.organizations using gin ((lower(name)) extensions.gin_trgm_ops);
create index if not exists organizations_email_trgm_idx on public.organizations using gin ((lower(coalesce(email,''))) extensions.gin_trgm_ops);
create index if not exists tasks_title_trgm_idx on public.tasks using gin ((lower(title)) extensions.gin_trgm_ops);

comment on table public.contact_addresses is 'Strukturierte Kontaktadressen; mehrere Adressen pro Kontakt möglich, maximal eine aktive Primäradresse.';
