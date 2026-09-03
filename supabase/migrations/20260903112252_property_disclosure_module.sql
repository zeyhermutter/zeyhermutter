-- Thema 2 (Maklerpraxis): Objektnachweis und Interessentenschutz
-- Beweisbar machen, wem wann welches Objekt auf welchem Weg nachgewiesen wurde.
-- Der Nachweis ist bewusst etwas anderes als die interne Match-Entscheidung in
-- search_profile_property_decisions: die Entscheidung ist intern, der Nachweis ist
-- nach aussen belegbar. Keine der beiden Strukturen ersetzt die andere.
-- Das System dokumentiert nur; es bewertet keine Kausalitaet und keinen Provisionsanspruch.

create sequence if not exists public.property_disclosure_number_seq;

create table if not exists public.property_disclosures (
  id uuid primary key default gen_random_uuid(),
  disclosure_number text not null unique default ('ZM-ON-' || lpad(nextval('public.property_disclosure_number_seq'::regclass)::text, 6, '0')),
  property_id uuid not null constraint property_disclosures_property_id_fkey references public.properties(id),
  contact_id uuid not null constraint property_disclosures_contact_id_fkey references public.contacts(id),
  search_profile_id uuid constraint property_disclosures_search_profile_id_fkey references public.search_profiles(id),
  inquiry_id uuid constraint property_disclosures_inquiry_id_fkey references public.inquiries(id),
  viewing_id uuid constraint property_disclosures_viewing_id_fkey references public.viewings(id),
  publication_version_id uuid constraint property_disclosures_publication_version_id_fkey references public.property_publication_versions(id),
  expose_id uuid constraint property_disclosures_expose_id_fkey references public.property_exposes(id),
  disclosed_at timestamptz not null default now(),
  channel text not null default 'EXPOSE_EMAIL' check (channel in ('EXPOSE_EMAIL','PORTAL','WEBSITE','IN_PERSON','VIEWING','PHONE','POSTAL','OTHER')),
  channel_reference text,
  acknowledgement_kind text not null default 'NONE' check (acknowledgement_kind in ('NONE','EMAIL_REPLY','READ_RECEIPT','SIGNATURE','PORTAL_LOG','VERBAL','OTHER')),
  acknowledged_at timestamptz,
  acknowledgement_reference text,
  prior_knowledge_declared boolean not null default false,
  prior_knowledge_source text,
  prior_knowledge_on date,
  resale_prohibition_notice_given boolean not null default false,
  notes text,
  primary_responsible_user uuid not null default auth.uid() constraint property_disclosures_primary_responsible_user_fkey references public.profiles(user_id),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() constraint property_disclosures_created_by_fkey references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() constraint property_disclosures_updated_by_fkey references public.profiles(user_id),
  archived_at timestamptz,
  archived_by uuid constraint property_disclosures_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),
  constraint property_disclosures_ack_check check (acknowledgement_kind <> 'NONE' or acknowledged_at is null),
  constraint property_disclosures_ack_order_check check (acknowledged_at is null or acknowledged_at >= disclosed_at),
  constraint property_disclosures_prior_knowledge_check check (
    prior_knowledge_declared or (prior_knowledge_source is null and prior_knowledge_on is null)
  )
);

comment on table public.property_disclosures is 'Objektnachweis: wem wann auf welchem Weg welches Objekt nachgewiesen wurde, inklusive Empfangsbestaetigung und erklaerter Vorkenntnis. Reine Dokumentation, keine rechtliche Bewertung.';
comment on column public.property_disclosures.publication_version_id is 'Nachgewiesene Publikationsversion, damit spaeter belegbar ist, welcher Stand uebermittelt wurde.';
comment on column public.property_disclosures.prior_knowledge_declared is 'Der Interessent hat erklaert, das Objekt bereits gekannt zu haben. Das System bewertet diese Erklaerung nicht.';

create index if not exists property_disclosures_property_idx on public.property_disclosures(property_id, disclosed_at desc) where archived_at is null;
create index if not exists property_disclosures_contact_idx on public.property_disclosures(contact_id, disclosed_at desc) where archived_at is null;
create index if not exists property_disclosures_search_profile_idx on public.property_disclosures(search_profile_id);
create index if not exists property_disclosures_inquiry_idx on public.property_disclosures(inquiry_id);
create index if not exists property_disclosures_viewing_idx on public.property_disclosures(viewing_id);
create index if not exists property_disclosures_publication_version_idx on public.property_disclosures(publication_version_id);
create index if not exists property_disclosures_expose_idx on public.property_disclosures(expose_id);
create index if not exists property_disclosures_responsible_idx on public.property_disclosures(primary_responsible_user);
create index if not exists property_disclosures_created_by_idx on public.property_disclosures(created_by);
create index if not exists property_disclosures_updated_by_idx on public.property_disclosures(updated_by);
create index if not exists property_disclosures_archived_by_idx on public.property_disclosures(archived_by);

insert into public.permissions(key,description) values
  ('disclosure.read','Objektnachweise lesen'),
  ('disclosure.write','Objektnachweise erfassen und bearbeiten'),
  ('disclosure.archive','Objektnachweise archivieren')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('disclosure.read','disclosure.write','disclosure.archive')
where r.key in ('admin','managing_director')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('disclosure.read','disclosure.write')
where r.key in ('agent','assistance')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key='disclosure.read'
where r.key='marketing'
on conflict do nothing;

create or replace function app_private.validate_property_disclosure()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_contact public.contacts%rowtype;
begin
  if tg_op='UPDATE' then
    if old.disclosure_number is distinct from new.disclosure_number then
      raise exception 'DISCLOSURE_NUMBER_IMMUTABLE' using errcode='42501';
    end if;
    if old.archived_at is not null and new.archived_at is not null and row(
      new.property_id,new.contact_id,new.search_profile_id,new.inquiry_id,new.viewing_id,
      new.publication_version_id,new.expose_id,new.disclosed_at,new.channel,new.channel_reference,
      new.acknowledgement_kind,new.acknowledged_at,new.acknowledgement_reference,
      new.prior_knowledge_declared,new.prior_knowledge_source,new.prior_knowledge_on,
      new.resale_prohibition_notice_given,new.notes,new.primary_responsible_user
    ) is distinct from row(
      old.property_id,old.contact_id,old.search_profile_id,old.inquiry_id,old.viewing_id,
      old.publication_version_id,old.expose_id,old.disclosed_at,old.channel,old.channel_reference,
      old.acknowledgement_kind,old.acknowledged_at,old.acknowledgement_reference,
      old.prior_knowledge_declared,old.prior_knowledge_source,old.prior_knowledge_on,
      old.resale_prohibition_notice_given,old.notes,old.primary_responsible_user
    ) then
      raise exception 'ARCHIVED_DISCLOSURE_IMMUTABLE' using errcode='22023';
    end if;
  end if;

  if new.disclosed_at > now() + interval '5 minutes' then
    raise exception 'DISCLOSURE_DATE_IN_FUTURE' using errcode='22023';
  end if;

  if not exists(select 1 from public.properties p where p.id=new.property_id) then
    raise exception 'DISCLOSURE_PROPERTY_NOT_FOUND' using errcode='P0002';
  end if;

  select * into v_contact from public.contacts where id=new.contact_id;
  if v_contact.id is null then
    raise exception 'DISCLOSURE_CONTACT_NOT_FOUND' using errcode='P0002';
  end if;
  if tg_op='INSERT' and v_contact.archived_at is not null then
    raise exception 'DISCLOSURE_CONTACT_ARCHIVED' using errcode='22023';
  end if;

  if not exists(select 1 from public.profiles p where p.user_id=new.primary_responsible_user and p.status='ACTIVE') then
    raise exception 'DISCLOSURE_RESPONSIBLE_USER_INACTIVE' using errcode='22023';
  end if;

  if new.prior_knowledge_declared and coalesce(btrim(new.prior_knowledge_source),'')='' then
    raise exception 'DISCLOSURE_PRIOR_KNOWLEDGE_SOURCE_REQUIRED' using errcode='22023';
  end if;

  if new.acknowledgement_kind <> 'NONE' and new.acknowledged_at is null then
    raise exception 'DISCLOSURE_ACKNOWLEDGEMENT_DATE_REQUIRED' using errcode='22023';
  end if;

  if new.search_profile_id is not null and not exists(
    select 1 from public.search_profiles sp where sp.id=new.search_profile_id and sp.contact_id=new.contact_id
  ) then
    raise exception 'DISCLOSURE_SEARCH_PROFILE_CONTACT_MISMATCH' using errcode='22023';
  end if;

  if new.inquiry_id is not null and not exists(
    select 1 from public.inquiries i
    where i.id=new.inquiry_id and i.contact_id=new.contact_id
      and (i.property_id is null or i.property_id=new.property_id)
  ) then
    raise exception 'DISCLOSURE_INQUIRY_MISMATCH' using errcode='22023';
  end if;

  if new.viewing_id is not null and not exists(
    select 1 from public.viewings v
    where v.id=new.viewing_id and v.property_id=new.property_id and v.contact_id=new.contact_id
  ) then
    raise exception 'DISCLOSURE_VIEWING_MISMATCH' using errcode='22023';
  end if;

  if new.publication_version_id is not null and not exists(
    select 1 from public.property_publication_versions pv
    join public.property_publications pp on pp.id=pv.publication_id
    where pv.id=new.publication_version_id and pp.property_id=new.property_id
  ) then
    raise exception 'DISCLOSURE_PUBLICATION_PROPERTY_MISMATCH' using errcode='22023';
  end if;

  if new.expose_id is not null and not exists(
    select 1 from public.property_exposes e where e.id=new.expose_id and e.property_id=new.property_id
  ) then
    raise exception 'DISCLOSURE_EXPOSE_PROPERTY_MISMATCH' using errcode='22023';
  end if;

  return new;
end;
$function$;

-- Fachlich verstaendliche Protokollierung im Aktivitaetenstrom.
create or replace function app_private.log_property_disclosure_activity()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_property text;
  v_contact text;
begin
  select p.property_number into v_property from public.properties p where p.id=new.property_id;
  select c.first_name || ' ' || c.last_name into v_contact from public.contacts c where c.id=new.contact_id;
  insert into public.activity_events(activity_type,title,description,actor_user_id,contact_id,property_id,inquiry_id,search_profile_id,viewing_id,occurred_at,metadata)
  values (
    'PROPERTY_DISCLOSURE',
    'Objekt nachgewiesen',
    coalesce(v_contact,'Interessent') || ' · ' || coalesce(v_property,'Objekt') || ' · ' || new.disclosure_number,
    auth.uid(), new.contact_id, new.property_id, new.inquiry_id, new.search_profile_id, new.viewing_id,
    new.disclosed_at,
    jsonb_build_object('disclosure_number',new.disclosure_number,'channel',new.channel)
  );
  return new;
end;
$function$;

revoke all on function app_private.log_property_disclosure_activity() from public;

alter table public.property_disclosures enable row level security;

drop policy if exists property_disclosures_select on public.property_disclosures;
create policy property_disclosures_select on public.property_disclosures for select to authenticated
using ((select app_private.has_permission('disclosure.read')));

drop policy if exists property_disclosures_insert on public.property_disclosures;
create policy property_disclosures_insert on public.property_disclosures for insert to authenticated
with check ((select app_private.has_permission('disclosure.write')) and created_by=(select auth.uid()));

drop policy if exists property_disclosures_update on public.property_disclosures;
create policy property_disclosures_update on public.property_disclosures for update to authenticated
using ((select app_private.has_permission('disclosure.write')))
with check ((select app_private.has_permission('disclosure.write')));

drop trigger if exists property_disclosures_10_validate on public.property_disclosures;
create trigger property_disclosures_10_validate before insert or update on public.property_disclosures
for each row execute function app_private.validate_property_disclosure();

drop trigger if exists property_disclosures_20_archive_guard on public.property_disclosures;
create trigger property_disclosures_20_archive_guard before update on public.property_disclosures
for each row execute function app_private.enforce_archive_permission('disclosure.archive');

drop trigger if exists property_disclosures_90_set_update_metadata on public.property_disclosures;
create trigger property_disclosures_90_set_update_metadata before update on public.property_disclosures
for each row execute function app_private.set_business_update_metadata();

drop trigger if exists property_disclosures_95_activity on public.property_disclosures;
create trigger property_disclosures_95_activity after insert on public.property_disclosures
for each row execute function app_private.log_property_disclosure_activity();

drop trigger if exists property_disclosures_audit on public.property_disclosures;
create trigger property_disclosures_audit after insert or update or delete on public.property_disclosures
for each row execute function app_private.audit_row_change('PROPERTY_DISCLOSURE','disclosure_number');

grant select, insert, update on public.property_disclosures to authenticated;
grant usage, select on sequence public.property_disclosure_number_seq to authenticated;
