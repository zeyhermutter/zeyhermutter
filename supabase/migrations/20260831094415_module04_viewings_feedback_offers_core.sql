create sequence if not exists public.viewing_number_seq start 1;
create sequence if not exists public.offer_number_seq start 1;

insert into public.permissions(key,description) values
 ('viewing.archive','Besichtigungen archivieren und wiederherstellen'),
 ('offer.read','Kaufangebote lesen'),
 ('offer.write','Kaufangebote bearbeiten'),
 ('offer.archive','Kaufangebote archivieren und wiederherstellen')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r join public.permissions p on p.key in ('viewing.archive','offer.read','offer.write','offer.archive')
where r.key in ('admin','agent','assistance','managing_director') on conflict do nothing;

create table public.viewing_status_transitions(
 from_status text not null,
 to_status text not null,
 description text,
 primary key(from_status,to_status)
);
insert into public.viewing_status_transitions values
 ('PLANNED','CONFIRMED','Termin bestätigen'),('PLANNED','CANCELLED','Termin absagen'),
 ('CONFIRMED','PLANNED','Bestätigung zurücknehmen'),('CONFIRMED','COMPLETED','Besichtigung durchgeführt'),('CONFIRMED','CANCELLED','Termin absagen'),('CONFIRMED','NO_SHOW','Nicht erschienen'),
 ('CANCELLED','PLANNED','Neu planen'),('NO_SHOW','PLANNED','Neu planen')
on conflict do nothing;
grant select on public.viewing_status_transitions to authenticated;

create table public.viewings(
 id uuid primary key default gen_random_uuid(),
 viewing_number text not null unique default ('ZM-B-'||lpad(nextval('public.viewing_number_seq')::text,6,'0')),
 property_id uuid not null references public.properties(id) on delete restrict,
 contact_id uuid not null references public.contacts(id) on delete restrict,
 search_profile_id uuid references public.search_profiles(id) on delete set null,
 inquiry_id uuid references public.inquiries(id) on delete set null,
 status text not null default 'PLANNED' check(status in ('PLANNED','CONFIRMED','COMPLETED','CANCELLED','NO_SHOW')),
 starts_at timestamptz not null,
 ends_at timestamptz,
 meeting_point text,
 internal_notes text,
 primary_responsible_user uuid references public.profiles(user_id) on delete set null,
 created_at timestamptz not null default now(),created_by uuid default auth.uid(),updated_at timestamptz not null default now(),updated_by uuid default auth.uid(),
 archived_at timestamptz,archived_by uuid,version bigint not null default 1,
 check(ends_at is null or ends_at>starts_at)
);
create index viewings_property_idx on public.viewings(property_id,starts_at desc) where archived_at is null;
create index viewings_contact_idx on public.viewings(contact_id,starts_at desc) where archived_at is null;
create index viewings_search_profile_idx on public.viewings(search_profile_id) where search_profile_id is not null and archived_at is null;
create index viewings_inquiry_idx on public.viewings(inquiry_id) where inquiry_id is not null and archived_at is null;
create index viewings_responsible_idx on public.viewings(primary_responsible_user,starts_at) where archived_at is null;
alter table public.viewings enable row level security;
create policy viewings_select on public.viewings for select using(app_private.has_permission('viewing.read'));
create policy viewings_insert on public.viewings for insert with check(app_private.has_permission('viewing.write') and created_by=(select auth.uid()));
create policy viewings_update on public.viewings for update using(app_private.has_permission('viewing.write')) with check(app_private.has_permission('viewing.write'));
create trigger viewings_set_update_metadata before update on public.viewings for each row execute function app_private.set_business_update_metadata();
create trigger viewings_archive_guard before update on public.viewings for each row execute function app_private.enforce_archive_permission('viewing.archive');
create trigger viewings_audit after insert or update or delete on public.viewings for each row execute function app_private.audit_row_change('VIEWING','viewing_number');

drop policy if exists viewing_status_transitions_select on public.viewing_status_transitions;
create policy viewing_status_transitions_select on public.viewing_status_transitions for select using(app_private.has_permission('viewing.read'));

create or replace function app_private.validate_viewing_business_rules()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and old.status is distinct from new.status then
  if not exists(select 1 from public.viewing_status_transitions t where t.from_status=old.status and t.to_status=new.status) then
   raise exception 'INVALID_VIEWING_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';
  end if;
 end if;
 if new.search_profile_id is not null and not exists(select 1 from public.search_profiles sp where sp.id=new.search_profile_id and sp.contact_id=new.contact_id) then
  raise exception 'VIEWING_SEARCH_PROFILE_CONTACT_MISMATCH' using errcode='22023';
 end if;
 if new.inquiry_id is not null and not exists(select 1 from public.inquiries i where i.id=new.inquiry_id and i.contact_id=new.contact_id) then
  raise exception 'VIEWING_INQUIRY_CONTACT_MISMATCH' using errcode='22023';
 end if;
 return new;
end;$$;
revoke all on function app_private.validate_viewing_business_rules() from public;
create trigger viewings_20_validate before insert or update on public.viewings for each row execute function app_private.validate_viewing_business_rules();

create table public.viewing_feedback(
 id uuid primary key default gen_random_uuid(),
 viewing_id uuid not null unique references public.viewings(id) on delete cascade,
 interest_level text not null check(interest_level in ('HIGH','MEDIUM','LOW','NONE')),
 positives text,
 concerns text,
 price_feedback numeric(14,2) check(price_feedback is null or price_feedback>=0),
 next_step text,
 internal_notes text,
 created_at timestamptz not null default now(),created_by uuid default auth.uid(),updated_at timestamptz not null default now(),updated_by uuid default auth.uid(),version bigint not null default 1
);
alter table public.viewing_feedback enable row level security;
create policy viewing_feedback_select on public.viewing_feedback for select using(app_private.has_permission('viewing.read'));
create policy viewing_feedback_insert on public.viewing_feedback for insert with check(app_private.has_permission('viewing.write') and created_by=(select auth.uid()));
create policy viewing_feedback_update on public.viewing_feedback for update using(app_private.has_permission('viewing.write')) with check(app_private.has_permission('viewing.write'));
create trigger viewing_feedback_set_update_metadata before update on public.viewing_feedback for each row execute function app_private.set_standard_update_metadata();
create trigger viewing_feedback_audit after insert or update or delete on public.viewing_feedback for each row execute function app_private.audit_row_change('VIEWING_FEEDBACK','id');

create or replace function app_private.validate_viewing_feedback()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if not exists(select 1 from public.viewings v where v.id=new.viewing_id and v.status='COMPLETED') then
  raise exception 'VIEWING_MUST_BE_COMPLETED_FOR_FEEDBACK' using errcode='22023';
 end if;
 return new;
end;$$;
revoke all on function app_private.validate_viewing_feedback() from public;
create trigger viewing_feedback_validate before insert or update on public.viewing_feedback for each row execute function app_private.validate_viewing_feedback();

create table public.offer_status_transitions(
 from_status text not null,to_status text not null,description text,primary key(from_status,to_status)
);
insert into public.offer_status_transitions values
 ('DRAFT','SUBMITTED','Angebot abgeben'),('DRAFT','WITHDRAWN','Entwurf zurückziehen'),
 ('SUBMITTED','COUNTERED','Gegenangebot erhalten'),('SUBMITTED','ACCEPTED','Angebot angenommen'),('SUBMITTED','REJECTED','Angebot abgelehnt'),('SUBMITTED','WITHDRAWN','Angebot zurückziehen'),
 ('COUNTERED','SUBMITTED','Neues Angebot abgeben'),('COUNTERED','ACCEPTED','Gegenangebot annehmen'),('COUNTERED','REJECTED','Gegenangebot ablehnen'),('COUNTERED','WITHDRAWN','Zurückziehen'),
 ('REJECTED','DRAFT','Neu vorbereiten')
on conflict do nothing;
grant select on public.offer_status_transitions to authenticated;

create table public.purchase_offers(
 id uuid primary key default gen_random_uuid(),
 offer_number text not null unique default ('ZM-O-'||lpad(nextval('public.offer_number_seq')::text,6,'0')),
 property_id uuid not null references public.properties(id) on delete restrict,
 contact_id uuid not null references public.contacts(id) on delete restrict,
 search_profile_id uuid references public.search_profiles(id) on delete set null,
 inquiry_id uuid references public.inquiries(id) on delete set null,
 viewing_id uuid references public.viewings(id) on delete set null,
 amount numeric(14,2) not null check(amount>0),
 status text not null default 'DRAFT' check(status in ('DRAFT','SUBMITTED','COUNTERED','ACCEPTED','REJECTED','WITHDRAWN')),
 financing_status text check(financing_status is null or financing_status in ('OPEN','IN_PROGRESS','CONFIRMED','NOT_REQUIRED')),
 submitted_at timestamptz,
 valid_until date,
 notes text,
 primary_responsible_user uuid references public.profiles(user_id) on delete set null,
 created_at timestamptz not null default now(),created_by uuid default auth.uid(),updated_at timestamptz not null default now(),updated_by uuid default auth.uid(),archived_at timestamptz,archived_by uuid,version bigint not null default 1
);
create index purchase_offers_property_idx on public.purchase_offers(property_id,status) where archived_at is null;
create index purchase_offers_contact_idx on public.purchase_offers(contact_id,status) where archived_at is null;
create index purchase_offers_viewing_idx on public.purchase_offers(viewing_id) where viewing_id is not null;
create index purchase_offers_responsible_idx on public.purchase_offers(primary_responsible_user,status) where archived_at is null;
alter table public.purchase_offers enable row level security;
create policy purchase_offers_select on public.purchase_offers for select using(app_private.has_permission('offer.read'));
create policy purchase_offers_insert on public.purchase_offers for insert with check(app_private.has_permission('offer.write') and created_by=(select auth.uid()));
create policy purchase_offers_update on public.purchase_offers for update using(app_private.has_permission('offer.write')) with check(app_private.has_permission('offer.write'));
create trigger purchase_offers_set_update_metadata before update on public.purchase_offers for each row execute function app_private.set_business_update_metadata();
create trigger purchase_offers_archive_guard before update on public.purchase_offers for each row execute function app_private.enforce_archive_permission('offer.archive');
create trigger purchase_offers_audit after insert or update or delete on public.purchase_offers for each row execute function app_private.audit_row_change('OFFER','offer_number');

drop policy if exists offer_status_transitions_select on public.offer_status_transitions;
create policy offer_status_transitions_select on public.offer_status_transitions for select using(app_private.has_permission('offer.read'));

create or replace function app_private.validate_purchase_offer()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
 if tg_op='UPDATE' and old.status is distinct from new.status then
  if not exists(select 1 from public.offer_status_transitions t where t.from_status=old.status and t.to_status=new.status) then
   raise exception 'INVALID_OFFER_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';
  end if;
 end if;
 if new.search_profile_id is not null and not exists(select 1 from public.search_profiles sp where sp.id=new.search_profile_id and sp.contact_id=new.contact_id) then raise exception 'OFFER_SEARCH_PROFILE_CONTACT_MISMATCH' using errcode='22023'; end if;
 if new.inquiry_id is not null and not exists(select 1 from public.inquiries i where i.id=new.inquiry_id and i.contact_id=new.contact_id) then raise exception 'OFFER_INQUIRY_CONTACT_MISMATCH' using errcode='22023'; end if;
 if new.viewing_id is not null and not exists(select 1 from public.viewings v where v.id=new.viewing_id and v.contact_id=new.contact_id and v.property_id=new.property_id) then raise exception 'OFFER_VIEWING_MISMATCH' using errcode='22023'; end if;
 if new.status='SUBMITTED' and new.submitted_at is null then new.submitted_at:=now(); end if;
 return new;
end;$$;
revoke all on function app_private.validate_purchase_offer() from public;
create trigger purchase_offers_20_validate before insert or update on public.purchase_offers for each row execute function app_private.validate_purchase_offer();

alter table public.activity_events drop constraint if exists activity_events_viewing_id_fkey;
alter table public.activity_events add constraint activity_events_viewing_id_fkey foreign key(viewing_id) references public.viewings(id) on delete set null;
alter table public.tasks add column if not exists viewing_id uuid references public.viewings(id) on delete set null;
create index if not exists tasks_viewing_idx on public.tasks(viewing_id) where viewing_id is not null;

drop policy if exists activity_events_select_crm on public.activity_events;
create policy activity_events_select_crm on public.activity_events for select using(
 ((contact_id is not null) and app_private.has_permission('contact.read')) or ((property_id is not null) and app_private.has_permission('property.read')) or ((lead_id is not null) and app_private.has_permission('lead.read')) or ((inquiry_id is not null) and app_private.has_permission('inquiry.read')) or ((search_profile_id is not null) and app_private.has_permission('search_profile.read')) or ((viewing_id is not null) and app_private.has_permission('viewing.read')) or ((contact_id is null) and (property_id is null) and (lead_id is null) and (inquiry_id is null) and (search_profile_id is null) and (viewing_id is null) and app_private.has_permission('audit.read'))
);
drop policy if exists activity_events_insert_crm on public.activity_events;
create policy activity_events_insert_crm on public.activity_events for insert with check(actor_user_id=(select auth.uid()) and(
 ((contact_id is not null) and app_private.has_permission('contact.write')) or ((property_id is not null) and app_private.has_permission('property.write')) or ((lead_id is not null) and app_private.has_permission('lead.write')) or ((inquiry_id is not null) and app_private.has_permission('inquiry.write')) or ((search_profile_id is not null) and app_private.has_permission('search_profile.write')) or ((viewing_id is not null) and app_private.has_permission('viewing.write')) or ((contact_id is null) and (property_id is null) and (lead_id is null) and (inquiry_id is null) and (search_profile_id is null) and (viewing_id is null))
));

drop policy if exists comments_select_crm on public.comments;
create policy comments_select_crm on public.comments for select using(((entity_type in ('CONTACT','ORGANIZATION')) and app_private.has_permission('contact.read')) or ((entity_type='TASK') and app_private.has_permission('task.read')) or ((entity_type='LEAD') and app_private.has_permission('lead.read')) or ((entity_type='SEARCH_PROFILE') and app_private.has_permission('search_profile.read')) or ((entity_type='INQUIRY') and app_private.has_permission('inquiry.read')) or ((entity_type='VIEWING') and app_private.has_permission('viewing.read')));
drop policy if exists comments_insert_crm on public.comments;
create policy comments_insert_crm on public.comments for insert with check(author_user_id=(select auth.uid()) and(((entity_type in ('CONTACT','ORGANIZATION')) and app_private.has_permission('contact.write')) or ((entity_type='TASK') and app_private.has_permission('task.write')) or ((entity_type='LEAD') and app_private.has_permission('lead.write')) or ((entity_type='SEARCH_PROFILE') and app_private.has_permission('search_profile.write')) or ((entity_type='INQUIRY') and app_private.has_permission('inquiry.write')) or ((entity_type='VIEWING') and app_private.has_permission('viewing.write'))));

create or replace function public.create_viewing_comment(p_viewing_id uuid,p_body text,p_mentioned_user_ids uuid[] default '{}'::uuid[])
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_user uuid:=auth.uid();v_comment_id uuid;v_mentioned uuid;
begin
 if v_user is null then raise exception 'AUTH_REQUIRED' using errcode='42501'; end if;
 if not app_private.has_permission('viewing.write') then raise exception 'VIEWING_WRITE_REQUIRED' using errcode='42501'; end if;
 if nullif(trim(coalesce(p_body,'')),'') is null then raise exception 'COMMENT_REQUIRED' using errcode='22023'; end if;
 if not exists(select 1 from public.viewings v where v.id=p_viewing_id and v.archived_at is null) then raise exception 'VIEWING_NOT_FOUND' using errcode='P0002'; end if;
 insert into public.comments(entity_type,entity_id,body,author_user_id) values('VIEWING',p_viewing_id,trim(p_body),v_user) returning id into v_comment_id;
 for v_mentioned in select distinct x from unnest(coalesce(p_mentioned_user_ids,'{}'::uuid[])) x where x<>v_user loop insert into public.comment_mentions(comment_id,mentioned_user_id) values(v_comment_id,v_mentioned) on conflict do nothing;end loop;
 return v_comment_id;
end;$$;
revoke all on function public.create_viewing_comment(uuid,text,uuid[]) from public,anon;
grant execute on function public.create_viewing_comment(uuid,text,uuid[]) to authenticated;

grant select,insert,update on public.viewings to authenticated;
grant select,insert,update on public.viewing_feedback to authenticated;
grant select,insert,update on public.purchase_offers to authenticated;
grant usage,select on sequence public.viewing_number_seq to authenticated;
grant usage,select on sequence public.offer_number_seq to authenticated;
