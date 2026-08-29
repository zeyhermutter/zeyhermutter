-- Applied to ZeyherMutterOS STAGING on 2026-08-29.
-- Source of truth for the initial security/history foundation.

create schema if not exists app_private;
revoke all on schema app_private from anon, authenticated;
grant usage on schema public to anon, authenticated;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  first_name text,
  last_name text,
  status text not null default 'INVITED' check (status in ('INVITED','ACTIVE','LOCKED','DISABLED')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1 check (version > 0)
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_]*$'),
  name text not null,
  description text,
  is_system boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z][a-z0-9_.]*$'),
  description text,
  created_at timestamptz not null default now()
);

create table public.role_permissions (
  role_id uuid not null references public.roles(id) on delete cascade,
  permission_id uuid not null references public.permissions(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (role_id, permission_id)
);

create table public.user_roles (
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references public.roles(id) on delete restrict,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references auth.users(id) on delete set null,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  primary key (user_id, role_id),
  check (revoked_at is null or revoked_at >= assigned_at)
);

create table public.audit_events (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_type text not null default 'USER' check (actor_type in ('USER','SYSTEM','AUTOMATION','API','IMPORT','PORTAL','MIGRATION')),
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_display_name_snapshot text,
  entity_type text not null,
  entity_id uuid,
  entity_reference text,
  action text not null,
  field_changes jsonb not null default '{}'::jsonb,
  description text,
  source text not null default 'USER' check (source in ('USER','SYSTEM','AUTOMATION','API','IMPORT','PORTAL','MIGRATION')),
  request_id text,
  metadata jsonb not null default '{}'::jsonb
);

create table public.activity_events (
  id uuid primary key default gen_random_uuid(),
  activity_type text not null,
  title text,
  description text,
  actor_user_id uuid references auth.users(id) on delete set null,
  contact_id uuid,
  property_id uuid,
  lead_id uuid,
  viewing_id uuid,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create table public.comments (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  body text not null check (length(trim(body)) > 0),
  author_user_id uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  version bigint not null default 1 check (version > 0)
);

create table public.comment_mentions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  mentioned_user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (comment_id, mentioned_user_id)
);

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  title text not null,
  message text,
  entity_type text,
  entity_id uuid,
  created_at timestamptz not null default now(),
  read_at timestamptz
);

create index user_roles_active_user_idx on public.user_roles(user_id) where revoked_at is null;
create index role_permissions_role_idx on public.role_permissions(role_id);
create index audit_events_entity_idx on public.audit_events(entity_type, entity_id, occurred_at desc);
create index audit_events_actor_idx on public.audit_events(actor_user_id, occurred_at desc);
create index audit_events_occurred_idx on public.audit_events(occurred_at desc);
create index activity_events_occurred_idx on public.activity_events(occurred_at desc);
create index comments_entity_idx on public.comments(entity_type, entity_id, created_at desc) where archived_at is null;
create index notifications_user_unread_idx on public.notifications(user_id, created_at desc) where read_at is null;

create or replace function app_private.set_updated_at_and_version()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create trigger profiles_set_updated_at_and_version before update on public.profiles
for each row execute function app_private.set_updated_at_and_version();
create trigger comments_set_updated_at_and_version before update on public.comments
for each row execute function app_private.set_updated_at_and_version();

create or replace function app_private.handle_new_auth_user()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_display_name text;
begin
  v_display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), '');
  if v_display_name is null then v_display_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''); end if;
  if v_display_name is null then v_display_name := 'Benutzer'; end if;
  insert into public.profiles (user_id, display_name, first_name, last_name, status)
  values (new.id, v_display_name,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'first_name', '')), ''),
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'last_name', '')), ''), 'INVITED')
  on conflict (user_id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created after insert on auth.users
for each row execute function app_private.handle_new_auth_user();

create or replace function app_private.has_permission(p_permission text)
returns boolean language sql stable security definer set search_path = public, pg_temp as $$
  select exists (
    select 1 from public.user_roles ur
    join public.role_permissions rp on rp.role_id = ur.role_id
    join public.permissions p on p.id = rp.permission_id
    join public.profiles pr on pr.user_id = ur.user_id
    where ur.user_id = auth.uid() and ur.revoked_at is null
      and pr.status = 'ACTIVE' and p.key = p_permission
  );
$$;
revoke all on function app_private.has_permission(text) from public;
grant execute on function app_private.has_permission(text) to authenticated;

insert into public.roles (key, name, description) values
('admin','Administrator','Technische Volladministration'),
('managing_director','Geschäftsführer','Vollständiger operativer Geschäftsführerzugriff'),
('agent','Makler','Operativer Maklerzugriff'),
('assistance','Assistenz','Kontakte, Aufgaben, Termine und Unterlagen'),
('marketing','Marketing','Website, Medien und Exposés') on conflict (key) do nothing;

insert into public.permissions (key, description) values
('user.read','Benutzer lesen'),('user.manage','Benutzer verwalten'),('permission.manage','Rollen und Berechtigungen verwalten'),
('contact.read','Kontakte lesen'),('contact.write','Kontakte bearbeiten'),('contact.archive','Kontakte archivieren'),
('organization.read','Organisationen lesen'),('organization.write','Organisationen bearbeiten'),
('property.read','Immobilien lesen'),('property.write','Immobilien bearbeiten'),('property.publish','Immobilien veröffentlichen'),('property.assign','Immobilien zuweisen'),('property.archive','Immobilien archivieren'),
('lead.read','Leads lesen'),('lead.write','Leads bearbeiten'),('inquiry.read','Anfragen lesen'),('inquiry.write','Anfragen bearbeiten'),
('viewing.read','Besichtigungen lesen'),('viewing.write','Besichtigungen bearbeiten'),('task.read','Aufgaben lesen'),('task.write','Aufgaben bearbeiten'),
('document.read','Dokumente lesen'),('document.write','Dokumente bearbeiten'),('document.confidential.read','Vertrauliche Dokumente lesen'),
('commission.read','Provisionen lesen'),('commission.write','Provisionen bearbeiten'),
('website.read','Website-Inhalte lesen'),('website.write','Website-Inhalte bearbeiten'),('website.publish','Website veröffentlichen'),
('audit.read','Audit-Historie lesen'),('security.read','Security-Historie lesen'),
('compliance.read','Compliance lesen'),('compliance.write','Compliance bearbeiten'),
('automation.read','Automatisierungen lesen'),('automation.manage','Automatisierungen verwalten'),
('settings.read','Einstellungen lesen'),('settings.manage','Einstellungen verwalten') on conflict (key) do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r cross join public.permissions p where r.key='admin' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key not in ('permission.manage') where r.key='managing_director' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
'contact.read','contact.write','organization.read','organization.write','property.read','property.write','property.assign','lead.read','lead.write','inquiry.read','inquiry.write','viewing.read','viewing.write','task.read','task.write','document.read','document.write','commission.read','website.read')
where r.key='agent' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in (
'contact.read','contact.write','organization.read','property.read','lead.read','inquiry.read','inquiry.write','viewing.read','viewing.write','task.read','task.write','document.read','document.write')
where r.key='assistance' on conflict do nothing;
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id from public.roles r join public.permissions p on p.key in ('property.read','document.read','website.read','website.write','website.publish')
where r.key='marketing' on conflict do nothing;

alter table public.profiles enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_roles enable row level security;
alter table public.audit_events enable row level security;
alter table public.activity_events enable row level security;
alter table public.comments enable row level security;
alter table public.comment_mentions enable row level security;
alter table public.notifications enable row level security;

create policy profiles_select_self_or_authorized on public.profiles for select to authenticated using (user_id=auth.uid() or app_private.has_permission('user.read'));
create policy roles_select_authenticated on public.roles for select to authenticated using (true);
create policy permissions_select_authenticated on public.permissions for select to authenticated using (true);
create policy role_permissions_select_authenticated on public.role_permissions for select to authenticated using (true);
create policy user_roles_select_self_or_authorized on public.user_roles for select to authenticated using (user_id=auth.uid() or app_private.has_permission('user.read'));
create policy audit_events_select_authorized on public.audit_events for select to authenticated using (app_private.has_permission('audit.read'));
create policy notifications_select_own on public.notifications for select to authenticated using (user_id=auth.uid());
create policy notifications_update_own on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());

revoke insert, update, delete on public.roles from anon, authenticated;
revoke insert, update, delete on public.permissions from anon, authenticated;
revoke insert, update, delete on public.role_permissions from anon, authenticated;
revoke insert, update, delete on public.user_roles from anon, authenticated;
revoke insert, update, delete on public.audit_events from anon, authenticated;

comment on table public.audit_events is 'Append-only fachliche Änderungshistorie. Client-Schreibzugriffe sind absichtlich gesperrt.';
comment on table public.activity_events is 'Fachliche Aktivitäten; Policies werden mit den fachlichen Modulen ergänzt.';
comment on schema app_private is 'Nicht über die Data API exponierte Hilfsfunktionen und Sicherheitslogik.';
