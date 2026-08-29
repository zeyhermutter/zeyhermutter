-- CRM core migration applied to ZeyherMutterOS STAGING.
-- Creates contacts, organizations, relationships, tasks, CRM RLS and generic audit triggers.

create sequence if not exists public.contact_number_seq start 1;
create sequence if not exists public.organization_number_seq start 1;
create sequence if not exists public.task_number_seq start 1;

create or replace function app_private.current_actor_display_name()
returns text language sql stable security definer set search_path = public, pg_temp as $$
  select p.display_name from public.profiles p where p.user_id = auth.uid();
$$;
revoke all on function app_private.current_actor_display_name() from public;
grant execute on function app_private.current_actor_display_name() to authenticated;

create or replace function app_private.audit_row_change()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_actor uuid := auth.uid(); v_actor_name text; v_old jsonb := '{}'::jsonb; v_new jsonb := '{}'::jsonb;
  v_changes jsonb := '{}'::jsonb; v_key text; v_action text; v_entity_reference text; v_row jsonb; v_source text;
begin
  if v_actor is not null then select p.display_name into v_actor_name from public.profiles p where p.user_id=v_actor; v_source:='USER';
  else v_actor_name:='System'; v_source:='SYSTEM'; end if;
  if tg_op='INSERT' then
    v_new:=to_jsonb(new); v_row:=v_new; v_action:='CREATE';
    v_changes:=jsonb_build_object('record',jsonb_build_object('old',null,'new',v_new-array['created_at','updated_at','created_by','updated_by','version']));
  elsif tg_op='UPDATE' then
    v_old:=to_jsonb(old); v_new:=to_jsonb(new); v_row:=v_new;
    for v_key in select key from (select key from jsonb_each(v_old) union select key from jsonb_each(v_new)) k
      where key<>all(array['created_at','updated_at','created_by','updated_by','version']) loop
      if (v_old->v_key) is distinct from (v_new->v_key) then
        v_changes:=v_changes||jsonb_build_object(v_key,jsonb_build_object('old',v_old->v_key,'new',v_new->v_key));
      end if;
    end loop;
    if v_changes='{}'::jsonb then return new; end if;
    if (v_old->'status') is distinct from (v_new->'status') then v_action:='STATUS_CHANGE'; else v_action:='UPDATE'; end if;
  elsif tg_op='DELETE' then
    v_old:=to_jsonb(old); v_row:=v_old; v_action:='DELETE';
    v_changes:=jsonb_build_object('record',jsonb_build_object('old',v_old-array['created_at','updated_at','created_by','updated_by','version'],'new',null));
  else return coalesce(new,old); end if;
  if tg_nargs>1 and tg_argv[1] is not null and tg_argv[1]<>'' then v_entity_reference:=v_row->>tg_argv[1]; end if;
  insert into public.audit_events(actor_type,actor_user_id,actor_display_name_snapshot,entity_type,entity_id,entity_reference,action,field_changes,source)
  values(case when v_actor is null then 'SYSTEM' else 'USER' end,v_actor,v_actor_name,tg_argv[0],(v_row->>'id')::uuid,v_entity_reference,v_action,v_changes,v_source);
  return coalesce(new,old);
end;
$$;
revoke all on function app_private.audit_row_change() from public;

create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  contact_number text not null unique default ('ZM-K-'||lpad(nextval('public.contact_number_seq')::text,6,'0')),
  salutation text, title text,
  first_name text not null check(length(trim(first_name))>0),
  last_name text not null check(length(trim(last_name))>0),
  email text, phone text, mobile text, birth_date date,
  preferred_channel text check(preferred_channel is null or preferred_channel in ('EMAIL','PHONE','MOBILE','OTHER')),
  language text not null default 'de', internal_notes text,
  status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE','ARCHIVED','BLOCKED')),
  primary_responsible_user uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  archived_at timestamptz, archived_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1 check(version>0),
  check(nullif(trim(coalesce(email,'')),'') is not null or nullif(trim(coalesce(phone,'')),'') is not null or nullif(trim(coalesce(mobile,'')),'') is not null)
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  organization_number text not null unique default ('ZM-O-'||lpad(nextval('public.organization_number_seq')::text,6,'0')),
  name text not null check(length(trim(name))>0), legal_form text, website text, email text, phone text,
  street text, house_number text, postal_code text, city text, country text not null default 'DE',
  register_data jsonb not null default '{}'::jsonb, notes text,
  status text not null default 'ACTIVE' check(status in ('ACTIVE','INACTIVE','ARCHIVED','BLOCKED')),
  primary_responsible_user uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  archived_at timestamptz, archived_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1 check(version>0)
);

create table public.contact_roles(id uuid primary key default gen_random_uuid(), key text not null unique check(key~'^[A-Z][A-Z0-9_]*$'), name text not null, created_at timestamptz not null default now());
create table public.contact_role_assignments(contact_id uuid not null references public.contacts(id) on delete cascade, role_id uuid not null references public.contact_roles(id) on delete restrict, created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null default auth.uid(), primary key(contact_id,role_id));
create table public.contact_relationships(id uuid primary key default gen_random_uuid(), contact_id uuid not null references public.contacts(id) on delete cascade, related_contact_id uuid not null references public.contacts(id) on delete cascade, relationship_type text not null, valid_from date, valid_until date, notes text, created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null default auth.uid(), check(contact_id<>related_contact_id), check(valid_until is null or valid_from is null or valid_until>=valid_from), unique(contact_id,related_contact_id,relationship_type));
create table public.contact_organization_relationships(id uuid primary key default gen_random_uuid(), contact_id uuid not null references public.contacts(id) on delete cascade, organization_id uuid not null references public.organizations(id) on delete cascade, role text, position text, valid_from date, valid_until date, created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null default auth.uid(), check(valid_until is null or valid_from is null or valid_until>=valid_from), unique(contact_id,organization_id,role,position));

create table public.tasks(
 id uuid primary key default gen_random_uuid(), task_number text not null unique default ('ZM-T-'||lpad(nextval('public.task_number_seq')::text,6,'0')),
 title text not null check(length(trim(title))>0), description text,
 status text not null default 'OPEN' check(status in ('OPEN','IN_PROGRESS','DONE','CANCELLED')),
 priority text not null default 'NORMAL' check(priority in ('LOW','NORMAL','HIGH','URGENT')),
 due_at timestamptz not null, responsible_user uuid not null references auth.users(id) on delete restrict,
 contact_id uuid references public.contacts(id) on delete set null, completed_at timestamptz,
 created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null default auth.uid(),
 updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null default auth.uid(),
 archived_at timestamptz, archived_by uuid references auth.users(id) on delete set null,
 version bigint not null default 1 check(version>0),
 check((status='DONE' and completed_at is not null) or status<>'DONE')
);
create table public.task_watchers(task_id uuid not null references public.tasks(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,created_at timestamptz not null default now(),created_by uuid references auth.users(id) on delete set null default auth.uid(),primary key(task_id,user_id));

insert into public.contact_roles(key,name) values
('OWNER','Eigentümer'),('SELLER','Verkäufer'),('BUYER','Käufer'),('BUYER_PROSPECT','Kaufinteressent'),('LANDLORD','Vermieter'),('TENANT','Mieter'),('TENANT_PROSPECT','Mietinteressent'),('NOTARY','Notar'),('BANK_CONTACT','Bankkontakt'),('FINANCING_ADVISOR','Finanzierungsberater'),('APPRAISER','Gutachter'),('ENERGY_CONSULTANT','Energieberater'),('PHOTOGRAPHER','Fotograf'),('TRADESPERSON','Handwerker'),('PROPERTY_MANAGER','Hausverwaltung'),('DEVELOPER','Bauträger/Projektentwickler'),('TAX_ADVISOR','Steuerberater'),('LAWYER','Rechtsanwalt'),('PARTNER','Kooperationspartner'),('REFERRAL_PARTNER','Empfehlungspartner') on conflict(key) do nothing;

create trigger contacts_set_updated_at_and_version before update on public.contacts for each row execute function app_private.set_updated_at_and_version();
create trigger organizations_set_updated_at_and_version before update on public.organizations for each row execute function app_private.set_updated_at_and_version();
create trigger tasks_set_updated_at_and_version before update on public.tasks for each row execute function app_private.set_updated_at_and_version();
create trigger contacts_audit after insert or update or delete on public.contacts for each row execute function app_private.audit_row_change('CONTACT','contact_number');
create trigger organizations_audit after insert or update or delete on public.organizations for each row execute function app_private.audit_row_change('ORGANIZATION','organization_number');
create trigger tasks_audit after insert or update or delete on public.tasks for each row execute function app_private.audit_row_change('TASK','task_number');
create trigger comments_audit after insert or update or delete on public.comments for each row execute function app_private.audit_row_change('COMMENT','id');

create index contacts_name_idx on public.contacts(last_name,first_name) where archived_at is null;
create index contacts_email_lower_idx on public.contacts(lower(email)) where email is not null and archived_at is null;
create index contacts_mobile_idx on public.contacts(mobile) where mobile is not null and archived_at is null;
create index contacts_responsible_idx on public.contacts(primary_responsible_user) where archived_at is null;
create index organizations_name_idx on public.organizations(name) where archived_at is null;
create index contact_roles_assign_contact_idx on public.contact_role_assignments(contact_id);
create index contact_relationships_contact_idx on public.contact_relationships(contact_id);
create index contact_relationships_related_idx on public.contact_relationships(related_contact_id);
create index contact_org_rel_contact_idx on public.contact_organization_relationships(contact_id);
create index contact_org_rel_org_idx on public.contact_organization_relationships(organization_id);
create index tasks_responsible_due_idx on public.tasks(responsible_user,due_at) where archived_at is null and status in ('OPEN','IN_PROGRESS');
create index tasks_contact_idx on public.tasks(contact_id) where contact_id is not null and archived_at is null;

alter table public.contacts enable row level security; alter table public.organizations enable row level security; alter table public.contact_roles enable row level security; alter table public.contact_role_assignments enable row level security; alter table public.contact_relationships enable row level security; alter table public.contact_organization_relationships enable row level security; alter table public.tasks enable row level security; alter table public.task_watchers enable row level security;

create policy contacts_select on public.contacts for select to authenticated using(app_private.has_permission('contact.read'));
create policy contacts_insert on public.contacts for insert to authenticated with check(app_private.has_permission('contact.write') and created_by=auth.uid());
create policy contacts_update on public.contacts for update to authenticated using(app_private.has_permission('contact.write')) with check(app_private.has_permission('contact.write'));
create policy organizations_select on public.organizations for select to authenticated using(app_private.has_permission('organization.read'));
create policy organizations_insert on public.organizations for insert to authenticated with check(app_private.has_permission('organization.write') and created_by=auth.uid());
create policy organizations_update on public.organizations for update to authenticated using(app_private.has_permission('organization.write')) with check(app_private.has_permission('organization.write'));
create policy contact_roles_select on public.contact_roles for select to authenticated using(app_private.has_permission('contact.read'));
create policy contact_role_assignments_select on public.contact_role_assignments for select to authenticated using(app_private.has_permission('contact.read'));
create policy contact_role_assignments_insert on public.contact_role_assignments for insert to authenticated with check(app_private.has_permission('contact.write') and created_by=auth.uid());
create policy contact_role_assignments_delete on public.contact_role_assignments for delete to authenticated using(app_private.has_permission('contact.write'));
create policy contact_relationships_select on public.contact_relationships for select to authenticated using(app_private.has_permission('contact.read'));
create policy contact_relationships_insert on public.contact_relationships for insert to authenticated with check(app_private.has_permission('contact.write') and created_by=auth.uid());
create policy contact_relationships_update on public.contact_relationships for update to authenticated using(app_private.has_permission('contact.write')) with check(app_private.has_permission('contact.write'));
create policy contact_relationships_delete on public.contact_relationships for delete to authenticated using(app_private.has_permission('contact.write'));
create policy contact_org_rel_select on public.contact_organization_relationships for select to authenticated using(app_private.has_permission('contact.read') or app_private.has_permission('organization.read'));
create policy contact_org_rel_insert on public.contact_organization_relationships for insert to authenticated with check(app_private.has_permission('contact.write') and created_by=auth.uid());
create policy contact_org_rel_update on public.contact_organization_relationships for update to authenticated using(app_private.has_permission('contact.write')) with check(app_private.has_permission('contact.write'));
create policy contact_org_rel_delete on public.contact_organization_relationships for delete to authenticated using(app_private.has_permission('contact.write'));
create policy tasks_select on public.tasks for select to authenticated using(app_private.has_permission('task.read'));
create policy tasks_insert on public.tasks for insert to authenticated with check(app_private.has_permission('task.write') and created_by=auth.uid());
create policy tasks_update on public.tasks for update to authenticated using(app_private.has_permission('task.write')) with check(app_private.has_permission('task.write'));
create policy task_watchers_select on public.task_watchers for select to authenticated using(app_private.has_permission('task.read'));
create policy task_watchers_insert on public.task_watchers for insert to authenticated with check(app_private.has_permission('task.write') and created_by=auth.uid());
create policy task_watchers_delete on public.task_watchers for delete to authenticated using(app_private.has_permission('task.write'));
create policy activity_events_select_crm on public.activity_events for select to authenticated using((contact_id is not null and app_private.has_permission('contact.read')) or (contact_id is null and app_private.has_permission('audit.read')));
create policy activity_events_insert_crm on public.activity_events for insert to authenticated with check(actor_user_id=auth.uid() and ((contact_id is not null and app_private.has_permission('contact.write')) or contact_id is null));
create policy comments_select_crm on public.comments for select to authenticated using((entity_type in ('CONTACT','ORGANIZATION') and app_private.has_permission('contact.read')) or (entity_type='TASK' and app_private.has_permission('task.read')));
create policy comments_insert_crm on public.comments for insert to authenticated with check(author_user_id=auth.uid() and ((entity_type in ('CONTACT','ORGANIZATION') and app_private.has_permission('contact.write')) or (entity_type='TASK' and app_private.has_permission('task.write'))));
create policy comments_update_own_crm on public.comments for update to authenticated using(author_user_id=auth.uid()) with check(author_user_id=auth.uid());
create policy comment_mentions_select on public.comment_mentions for select to authenticated using(mentioned_user_id=auth.uid() or app_private.has_permission('user.read'));
create policy comment_mentions_insert on public.comment_mentions for insert to authenticated with check(exists(select 1 from public.comments c where c.id=comment_id and c.author_user_id=auth.uid()));

revoke delete on public.contacts from anon,authenticated; revoke delete on public.organizations from anon,authenticated; revoke delete on public.tasks from anon,authenticated; revoke update,delete on public.activity_events from anon,authenticated;
grant select,insert,update on public.contacts to authenticated; grant select,insert,update on public.organizations to authenticated; grant select on public.contact_roles to authenticated; grant select,insert,delete on public.contact_role_assignments to authenticated; grant select,insert,update,delete on public.contact_relationships to authenticated; grant select,insert,update,delete on public.contact_organization_relationships to authenticated; grant select,insert,update on public.tasks to authenticated; grant select,insert,delete on public.task_watchers to authenticated; grant select,insert on public.activity_events to authenticated; grant select,insert,update on public.comments to authenticated; grant select,insert on public.comment_mentions to authenticated;
