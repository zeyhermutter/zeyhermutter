-- Thema 3 (Maklerpraxis): Geldwaesche-Compliance und Aufbewahrung
-- Das System erfasst und weist nach. Es bewertet nichts rechtlich, meldet nichts
-- automatisch und behauptet nicht, dass eine Pflicht erfuellt sei.

create sequence if not exists public.gwg_case_number_seq;

create table if not exists public.gwg_cases (
  id uuid primary key default gen_random_uuid(),
  case_number text not null unique default ('ZM-GW-' || lpad(nextval('public.gwg_case_number_seq'::regclass)::text, 6, '0')),
  property_id uuid not null constraint gwg_cases_property_id_fkey references public.properties(id),
  sale_closing_id uuid constraint gwg_cases_sale_closing_id_fkey references public.sale_closings(id),
  risk_level text check (risk_level is null or risk_level in ('LOW','MEDIUM','HIGH')),
  risk_rationale text,
  risk_assessed_on date,
  risk_assessed_by uuid constraint gwg_cases_risk_assessed_by_fkey references public.profiles(user_id),
  risk_next_review_on date,
  transparency_register_checked_on date,
  transparency_register_note text,
  source_of_funds_documented_on date,
  source_of_funds_note text,
  non_cash_payment_evidence_on date,
  non_cash_payment_note text,
  suspicious_indication_reviewed_on date,
  suspicious_indication_note text,
  report_filed_on date,
  report_reference text,
  retention_until date,
  legal_hold boolean not null default false,
  internal_notes text,
  primary_responsible_user uuid not null default auth.uid() constraint gwg_cases_primary_responsible_user_fkey references public.profiles(user_id),
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() constraint gwg_cases_created_by_fkey references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() constraint gwg_cases_updated_by_fkey references public.profiles(user_id),
  archived_at timestamptz,
  archived_by uuid constraint gwg_cases_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),
  constraint gwg_cases_risk_check check (risk_level is null or (coalesce(btrim(risk_rationale),'') <> '' and risk_assessed_on is not null)),
  constraint gwg_cases_report_check check (report_filed_on is null or suspicious_indication_reviewed_on is not null)
);

comment on table public.gwg_cases is 'Geldwaescherechtliche Akte je Verkaufsfall. Reine Dokumentation von Risikoeinstufung, Mittelherkunft, unbarer Zahlung, Pruefung auf Verdachtsmomente und Aufbewahrung. Keine automatische Meldung, keine rechtliche Bewertung.';
comment on column public.gwg_cases.report_reference is 'Nur Aktenzeichen bzw. Referenz einer abgegebenen Meldung. Inhaltliche Angaben gehoeren nicht in dieses Feld.';
comment on column public.gwg_cases.retention_until is 'Aufbewahrung der geldwaescherechtlichen Unterlagen, standardmaessig fuenf Jahre.';

create unique index if not exists gwg_cases_one_per_property_idx on public.gwg_cases(property_id) where archived_at is null;
create index if not exists gwg_cases_closing_idx on public.gwg_cases(sale_closing_id);
create index if not exists gwg_cases_retention_idx on public.gwg_cases(retention_until) where archived_at is null;
create index if not exists gwg_cases_responsible_idx on public.gwg_cases(primary_responsible_user);
create index if not exists gwg_cases_risk_assessed_by_idx on public.gwg_cases(risk_assessed_by);
create index if not exists gwg_cases_created_by_idx on public.gwg_cases(created_by);
create index if not exists gwg_cases_updated_by_idx on public.gwg_cases(updated_by);
create index if not exists gwg_cases_archived_by_idx on public.gwg_cases(archived_by);

create table if not exists public.gwg_identifications (
  id uuid primary key default gen_random_uuid(),
  gwg_case_id uuid not null constraint gwg_identifications_case_id_fkey references public.gwg_cases(id) on delete cascade,
  contact_id uuid not null constraint gwg_identifications_contact_id_fkey references public.contacts(id),
  party_role text not null check (party_role in ('SELLER','BUYER','REPRESENTATIVE','BENEFICIAL_OWNER')),
  represents_contact_id uuid constraint gwg_identifications_represents_contact_id_fkey references public.contacts(id),
  birth_date date,
  birth_place text,
  nationality text,
  residential_address text,
  document_type text check (document_type is null or document_type in ('PASSPORT','ID_CARD','RESIDENCE_PERMIT','OTHER')),
  document_number text,
  issuing_authority text,
  document_valid_until date,
  identification_method text check (identification_method is null or identification_method in ('IN_PERSON','VIDEO','ELECTRONIC','NOTARY','OTHER')),
  identified_on date,
  identified_by uuid constraint gwg_identifications_identified_by_fkey references public.profiles(user_id),
  proof_document_id uuid constraint gwg_identifications_proof_document_id_fkey references public.documents(id),
  screening_done_on date,
  screening_source text,
  screening_result text check (screening_result is null or screening_result in ('NO_MATCH','POSSIBLE_MATCH','MATCH','UNCLEAR')),
  screening_note text,
  politically_exposed boolean not null default false,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() constraint gwg_identifications_created_by_fkey references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() constraint gwg_identifications_updated_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),
  unique (gwg_case_id, contact_id, party_role),
  constraint gwg_identifications_screening_check check (screening_result is null or screening_done_on is not null),
  constraint gwg_identifications_identified_check check (identified_on is null or (document_type is not null and coalesce(btrim(document_number),'') <> '' and identification_method is not null and identified_by is not null))
);

comment on table public.gwg_identifications is 'Identifizierung der Beteiligten eines Verkaufsfalls samt dokumentiertem Listenabgleich. Der Abgleich wird erfasst, nicht automatisch durchgefuehrt.';

create index if not exists gwg_identifications_case_idx on public.gwg_identifications(gwg_case_id);
create index if not exists gwg_identifications_contact_idx on public.gwg_identifications(contact_id);
create index if not exists gwg_identifications_represents_idx on public.gwg_identifications(represents_contact_id);
create index if not exists gwg_identifications_identified_by_idx on public.gwg_identifications(identified_by);
create index if not exists gwg_identifications_proof_document_idx on public.gwg_identifications(proof_document_id);
create index if not exists gwg_identifications_created_by_idx on public.gwg_identifications(created_by);
create index if not exists gwg_identifications_updated_by_idx on public.gwg_identifications(updated_by);

alter table public.documents drop constraint if exists documents_category_check;
alter table public.documents add constraint documents_category_check check (category = any (array[
  'LAND_REGISTER','CADASTRAL_MAP','FLOOR_PLAN','LIVING_AREA_CALCULATION','ENERGY_CERTIFICATE',
  'DECLARATION_OF_DIVISION','BUILDING_DOCUMENTS','TENANCY_AGREEMENT','WEG','BUSINESS_PLAN','MINUTES',
  'BROKERAGE_AGREEMENT','PHOTOS','NOTARY','INVOICE','IDENTITY_PROOF','OTHER'
]));

insert into public.permissions(key,description) values
  ('gwg.read','Geldwäscheunterlagen lesen'),
  ('gwg.write','Geldwäscheunterlagen bearbeiten'),
  ('gwg.archive','Geldwäscheakten archivieren')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('gwg.read','gwg.write','gwg.archive')
where r.key in ('admin','managing_director')
on conflict do nothing;

create or replace function app_private.enforce_identity_proof_document()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if new.category='IDENTITY_PROOF' then
    new.classification := 'CONFIDENTIAL';
    new.retention_category := coalesce(new.retention_category,'GWG_IDENTIFICATION');
    new.retention_until := coalesce(new.retention_until, (coalesce(new.created_at, now()) + interval '5 years')::date);
    new.deletion_eligible_at := new.retention_until;
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_gwg_case()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  new.retention_until := coalesce(new.retention_until, (coalesce(new.created_at, now()) + interval '5 years')::date);
  if tg_op='UPDATE' then
    if old.case_number is distinct from new.case_number then
      raise exception 'GWG_CASE_NUMBER_IMMUTABLE' using errcode='42501';
    end if;
    if old.archived_at is not null and new.archived_at is not null
       and row(new.risk_level,new.risk_rationale,new.risk_assessed_on,new.source_of_funds_documented_on,
               new.non_cash_payment_evidence_on,new.report_filed_on,new.report_reference,new.internal_notes)
       is distinct from
           row(old.risk_level,old.risk_rationale,old.risk_assessed_on,old.source_of_funds_documented_on,
               old.non_cash_payment_evidence_on,old.report_filed_on,old.report_reference,old.internal_notes) then
      raise exception 'ARCHIVED_GWG_CASE_IMMUTABLE' using errcode='22023';
    end if;
  end if;
  if not exists(select 1 from public.properties p where p.id=new.property_id) then
    raise exception 'GWG_PROPERTY_NOT_FOUND' using errcode='P0002';
  end if;
  if new.sale_closing_id is not null and not exists(
    select 1 from public.sale_closings sc where sc.id=new.sale_closing_id and sc.property_id=new.property_id
  ) then
    raise exception 'GWG_CLOSING_PROPERTY_MISMATCH' using errcode='22023';
  end if;
  if not exists(select 1 from public.profiles p where p.user_id=new.primary_responsible_user and p.status='ACTIVE') then
    raise exception 'GWG_RESPONSIBLE_USER_INACTIVE' using errcode='22023';
  end if;
  if new.risk_assessed_on is not null and new.risk_assessed_on > current_date then
    raise exception 'GWG_RISK_DATE_IN_FUTURE' using errcode='22023';
  end if;
  if new.report_filed_on is not null and new.report_filed_on > current_date then
    raise exception 'GWG_REPORT_DATE_IN_FUTURE' using errcode='22023';
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_gwg_identification()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_case public.gwg_cases%rowtype;
begin
  select * into v_case from public.gwg_cases where id=new.gwg_case_id;
  if v_case.id is null then raise exception 'GWG_CASE_NOT_FOUND' using errcode='P0002'; end if;
  if v_case.archived_at is not null then raise exception 'ARCHIVED_GWG_CASE_IMMUTABLE' using errcode='22023'; end if;
  if not exists(select 1 from public.contacts c where c.id=new.contact_id) then
    raise exception 'GWG_CONTACT_NOT_FOUND' using errcode='P0002';
  end if;
  if new.identified_on is not null and new.identified_on > current_date then
    raise exception 'GWG_IDENTIFICATION_DATE_IN_FUTURE' using errcode='22023';
  end if;
  if new.screening_done_on is not null and new.screening_done_on > current_date then
    raise exception 'GWG_SCREENING_DATE_IN_FUTURE' using errcode='22023';
  end if;
  if new.party_role in ('BENEFICIAL_OWNER','REPRESENTATIVE') and new.represents_contact_id is null then
    raise exception 'GWG_REPRESENTED_CONTACT_REQUIRED' using errcode='22023';
  end if;
  if new.represents_contact_id is not null and new.represents_contact_id = new.contact_id then
    raise exception 'GWG_REPRESENTED_CONTACT_MUST_DIFFER' using errcode='22023';
  end if;
  if new.proof_document_id is not null and not exists(
    select 1 from public.documents d where d.id=new.proof_document_id and d.category='IDENTITY_PROOF'
  ) then
    raise exception 'GWG_PROOF_DOCUMENT_CATEGORY' using errcode='22023';
  end if;
  return new;
end;
$function$;

create or replace function public.log_gwg_case_access(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_actor uuid := auth.uid();
  v_name text;
  v_number text;
begin
  if v_actor is null then return; end if;
  if not app_private.has_permission('gwg.read') then
    raise exception 'GWG_READ_REQUIRED' using errcode='42501';
  end if;
  select case_number into v_number from public.gwg_cases where id=p_case_id;
  if v_number is null then return; end if;
  select display_name into v_name from public.profiles where user_id=v_actor;
  insert into public.audit_events(actor_type,actor_user_id,actor_display_name_snapshot,entity_type,entity_id,entity_reference,action,field_changes,source,metadata)
  values ('USER',v_actor,coalesce(v_name,'Benutzer'),'GWG_CASE',p_case_id,v_number,'READ','{}'::jsonb,'USER',jsonb_build_object('access','VIEW'));
end;
$function$;

revoke all on function public.log_gwg_case_access(uuid) from public;
grant execute on function public.log_gwg_case_access(uuid) to authenticated;

alter table public.gwg_cases enable row level security;
alter table public.gwg_identifications enable row level security;

drop policy if exists gwg_cases_select on public.gwg_cases;
create policy gwg_cases_select on public.gwg_cases for select to authenticated
using ((select app_private.has_permission('gwg.read')));

drop policy if exists gwg_cases_insert on public.gwg_cases;
create policy gwg_cases_insert on public.gwg_cases for insert to authenticated
with check ((select app_private.has_permission('gwg.write')) and created_by=(select auth.uid()));

drop policy if exists gwg_cases_update on public.gwg_cases;
create policy gwg_cases_update on public.gwg_cases for update to authenticated
using ((select app_private.has_permission('gwg.write')))
with check ((select app_private.has_permission('gwg.write')));

drop policy if exists gwg_identifications_select on public.gwg_identifications;
create policy gwg_identifications_select on public.gwg_identifications for select to authenticated
using ((select app_private.has_permission('gwg.read')));

drop policy if exists gwg_identifications_insert on public.gwg_identifications;
create policy gwg_identifications_insert on public.gwg_identifications for insert to authenticated
with check ((select app_private.has_permission('gwg.write')) and created_by=(select auth.uid()));

drop policy if exists gwg_identifications_update on public.gwg_identifications;
create policy gwg_identifications_update on public.gwg_identifications for update to authenticated
using ((select app_private.has_permission('gwg.write')))
with check ((select app_private.has_permission('gwg.write')));

drop policy if exists gwg_identifications_delete on public.gwg_identifications;
create policy gwg_identifications_delete on public.gwg_identifications for delete to authenticated
using ((select app_private.has_permission('gwg.write')));

drop policy if exists documents_select on public.documents;
create policy documents_select on public.documents for select to authenticated
using (
  case
    when category='IDENTITY_PROOF'
      then app_private.has_permission('gwg.read') and app_private.has_permission('document.confidential.read')
    when classification='CONFIDENTIAL'
      then app_private.has_permission('document.confidential.read')
    else app_private.has_permission('document.read')
  end
);

drop policy if exists documents_insert on public.documents;
create policy documents_insert on public.documents for insert to authenticated
with check (
  app_private.has_permission('document.write')
  and created_by=(select auth.uid())
  and (category <> 'IDENTITY_PROOF' or app_private.has_permission('gwg.write'))
);

drop policy if exists documents_update on public.documents;
create policy documents_update on public.documents for update to authenticated
using (app_private.has_permission('document.write') and (category <> 'IDENTITY_PROOF' or app_private.has_permission('gwg.write')))
with check (app_private.has_permission('document.write') and (category <> 'IDENTITY_PROOF' or app_private.has_permission('gwg.write')));

drop trigger if exists gwg_cases_10_validate on public.gwg_cases;
create trigger gwg_cases_10_validate before insert or update on public.gwg_cases
for each row execute function app_private.validate_gwg_case();

drop trigger if exists gwg_cases_20_archive_guard on public.gwg_cases;
create trigger gwg_cases_20_archive_guard before update on public.gwg_cases
for each row execute function app_private.enforce_archive_permission('gwg.archive');

drop trigger if exists gwg_cases_90_set_update_metadata on public.gwg_cases;
create trigger gwg_cases_90_set_update_metadata before update on public.gwg_cases
for each row execute function app_private.set_business_update_metadata();

drop trigger if exists gwg_cases_audit on public.gwg_cases;
create trigger gwg_cases_audit after insert or update or delete on public.gwg_cases
for each row execute function app_private.audit_row_change('GWG_CASE','case_number');

drop trigger if exists gwg_identifications_10_validate on public.gwg_identifications;
create trigger gwg_identifications_10_validate before insert or update on public.gwg_identifications
for each row execute function app_private.validate_gwg_identification();

drop trigger if exists gwg_identifications_40_metadata on public.gwg_identifications;
create trigger gwg_identifications_40_metadata before update on public.gwg_identifications
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists gwg_identifications_90_audit on public.gwg_identifications;
create trigger gwg_identifications_90_audit after insert or update or delete on public.gwg_identifications
for each row execute function app_private.audit_row_change('GWG_IDENTIFICATION','party_role');

drop trigger if exists documents_05_identity_proof on public.documents;
create trigger documents_05_identity_proof before insert or update on public.documents
for each row execute function app_private.enforce_identity_proof_document();

grant select, insert, update on public.gwg_cases to authenticated;
grant select, insert, update, delete on public.gwg_identifications to authenticated;
grant usage, select on sequence public.gwg_case_number_seq to authenticated;
