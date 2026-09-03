-- Thema 5 (Maklerpraxis): Verfuegungsberechtigung bei Nachlass, Vollmacht und Betreuung.
-- Die Frage, die beantwortet werden soll: Wer darf dieses Objekt verkaufen, und was
-- fehlt dafuer noch? Das System erfasst Sachverhalte, Zustimmungen und Genehmigungen
-- und macht Luecken sichtbar. Es beurteilt nicht, ob eine Vollmacht ausreicht.

insert into public.contact_roles(key,name) values
  ('HEIR','Erbe'),
  ('CO_HEIR','Miterbe'),
  ('EXECUTOR','Testamentsvollstrecker'),
  ('LEGAL_GUARDIAN','Betreuer'),
  ('ATTORNEY_IN_FACT','Bevollmächtigter'),
  ('SUPPLEMENTARY_CURATOR','Ergänzungspfleger')
on conflict (key) do nothing;

insert into public.permissions(key,description) values
  ('disposition.read','Verfügungsberechtigung lesen'),
  ('disposition.write','Verfügungsberechtigung bearbeiten'),
  ('disposition.archive','Angaben zur Verfügungsberechtigung archivieren')
on conflict (key) do update set description=excluded.description;

-- Nachlass- und Betreuungsangaben sind schutzwuerdig, aber zugleich taegliches
-- Arbeitsmittel im Verkauf. Deshalb ein eigenes, entziehbares Recht statt einer
-- Beschraenkung auf die Geschaeftsfuehrung.
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('disposition.read','disposition.write')
where r.key in ('admin','managing_director','agent','assistance')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key = 'disposition.archive'
where r.key in ('admin','managing_director')
on conflict do nothing;

create table if not exists public.property_dispositions (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique constraint property_dispositions_property_id_fkey references public.properties(id) on delete cascade,

  ownership_structure text not null default 'UNKNOWN'
    check (ownership_structure in ('SOLE','FRACTIONAL','COMMUNITY_OF_HEIRS','MARITAL_COMMUNITY','OTHER','UNKNOWN')),

  inheritance_case boolean not null default false,
  decedent_name text,
  decedent_contact_id uuid constraint property_dispositions_decedent_contact_id_fkey references public.contacts(id),
  date_of_death date,
  succession_proof_type text
    check (succession_proof_type is null or succession_proof_type in ('CERTIFICATE_OF_INHERITANCE','NOTARIAL_WILL','EUROPEAN_CERTIFICATE','OTHER')),
  succession_proof_applied_on date,
  succession_proof_issued_on date,
  succession_proof_reference text,
  land_register_corrected boolean not null default false,
  land_register_corrected_on date,

  executor_appointed boolean not null default false,

  spousal_consent_required boolean not null default false,
  spousal_consent_given_on date,

  disposition_notes text,
  reviewed_on date,
  reviewed_by uuid constraint property_dispositions_reviewed_by_fkey references public.profiles(user_id),

  created_at timestamptz not null default now(),
  created_by uuid constraint property_dispositions_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint property_dispositions_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),

  constraint property_dispositions_inheritance_check check (
    inheritance_case
    or (decedent_contact_id is null and coalesce(btrim(decedent_name),'') = '' and date_of_death is null
        and succession_proof_type is null and succession_proof_applied_on is null
        and succession_proof_issued_on is null and coalesce(btrim(succession_proof_reference),'') = ''
        and land_register_corrected = false and land_register_corrected_on is null)
  ),
  constraint property_dispositions_death_date_check check (date_of_death is null or date_of_death <= current_date),
  constraint property_dispositions_proof_dates_check check (
    succession_proof_issued_on is null or succession_proof_applied_on is null
    or succession_proof_issued_on >= succession_proof_applied_on
  ),
  constraint property_dispositions_land_register_check check (
    land_register_corrected or land_register_corrected_on is null
  ),
  constraint property_dispositions_spousal_check check (
    spousal_consent_required or spousal_consent_given_on is null
  ),
  constraint property_dispositions_reviewed_check check (reviewed_on is null or reviewed_on <= current_date)
);

comment on table public.property_dispositions is 'Verfuegungsberechtigung je Immobilie: Eigentuemerstellung, Erbfall, Testamentsvollstreckung und Ehegattenzustimmung. Reine Erfassung; das System beurteilt nicht, ob jemand wirksam verfuegen kann.';

create index if not exists property_dispositions_decedent_idx on public.property_dispositions(decedent_contact_id);
create index if not exists property_dispositions_reviewed_by_idx on public.property_dispositions(reviewed_by);
create index if not exists property_dispositions_created_by_idx on public.property_dispositions(created_by);
create index if not exists property_dispositions_updated_by_idx on public.property_dispositions(updated_by);

create table if not exists public.property_disposition_parties (
  id uuid primary key default gen_random_uuid(),
  disposition_id uuid not null constraint property_disposition_parties_disposition_id_fkey references public.property_dispositions(id) on delete cascade,
  contact_id uuid not null constraint property_disposition_parties_contact_id_fkey references public.contacts(id),
  party_role text not null check (party_role in ('OWNER','CO_HEIR','EXECUTOR','ATTORNEY_IN_FACT','LEGAL_GUARDIAN','SUPPLEMENTARY_CURATOR','SPOUSE')),
  represents_contact_id uuid constraint property_disposition_parties_represents_contact_id_fkey references public.contacts(id),
  share_percentage numeric(6,3) check (share_percentage is null or (share_percentage > 0 and share_percentage <= 100)),

  consent_status text not null default 'OPEN' check (consent_status in ('NOT_REQUIRED','OPEN','GIVEN','REFUSED')),
  consent_on date,
  consent_form text check (consent_form is null or consent_form in ('PRIVATE_WRITTEN','CERTIFIED','NOTARIAL','VERBAL')),

  power_of_attorney_type text check (power_of_attorney_type is null or power_of_attorney_type in ('GENERAL','PRECAUTIONARY','SALE','OTHER')),
  power_of_attorney_form text check (power_of_attorney_form is null or power_of_attorney_form in ('PRIVATE_WRITTEN','CERTIFIED','NOTARIAL')),
  power_of_attorney_scope text,
  power_of_attorney_valid_until date,
  power_of_attorney_revoked_on date,

  is_minor boolean not null default false,
  supervising_court text,
  guardianship_scope text,
  court_approval_required boolean not null default false,
  court_approval_applied_on date,
  court_approval_granted_on date,
  court_approval_reference text,

  notes text,

  created_at timestamptz not null default now(),
  created_by uuid constraint property_disposition_parties_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint property_disposition_parties_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  archived_at timestamptz,
  archived_by uuid constraint property_disposition_parties_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),

  unique (disposition_id, contact_id, party_role),

  constraint property_disposition_parties_consent_check check (
    consent_status <> 'GIVEN' or (consent_on is not null and consent_form is not null)
  ),
  constraint property_disposition_parties_consent_date_check check (
    consent_on is null or consent_on <= current_date
  ),
  constraint property_disposition_parties_poa_check check (
    party_role = 'ATTORNEY_IN_FACT'
    or (power_of_attorney_type is null and power_of_attorney_form is null
        and coalesce(btrim(power_of_attorney_scope),'') = ''
        and power_of_attorney_valid_until is null and power_of_attorney_revoked_on is null)
  ),
  constraint property_disposition_parties_poa_required_check check (
    party_role <> 'ATTORNEY_IN_FACT' or (power_of_attorney_type is not null and power_of_attorney_form is not null)
  ),
  constraint property_disposition_parties_court_check check (
    court_approval_required or (court_approval_applied_on is null and court_approval_granted_on is null and coalesce(btrim(court_approval_reference),'') = '')
  ),
  constraint property_disposition_parties_court_dates_check check (
    court_approval_granted_on is null or court_approval_applied_on is null
    or court_approval_granted_on >= court_approval_applied_on
  ),
  constraint property_disposition_parties_share_check check (
    share_percentage is null or party_role in ('OWNER','CO_HEIR')
  )
);

comment on table public.property_disposition_parties is 'Beteiligte der Verfuegungsberechtigung: Eigentuemer, Miterben, Testamentsvollstrecker, Bevollmaechtigte, Betreuer, Ergaenzungspfleger und zustimmende Ehegatten samt Zustimmungen und gerichtlichen Genehmigungen.';
comment on column public.property_disposition_parties.supervising_court is 'Zustaendiges Gericht: Betreuungsgericht bei Betreuung, Familiengericht bei minderjaehrigen Beteiligten.';

create index if not exists property_disposition_parties_disposition_idx on public.property_disposition_parties(disposition_id);
create index if not exists property_disposition_parties_contact_idx on public.property_disposition_parties(contact_id);
create index if not exists property_disposition_parties_represents_idx on public.property_disposition_parties(represents_contact_id);
create index if not exists property_disposition_parties_open_idx on public.property_disposition_parties(disposition_id, consent_status) where archived_at is null;
create index if not exists property_disposition_parties_created_by_idx on public.property_disposition_parties(created_by);
create index if not exists property_disposition_parties_updated_by_idx on public.property_disposition_parties(updated_by);
create index if not exists property_disposition_parties_archived_by_idx on public.property_disposition_parties(archived_by);

create or replace function app_private.validate_property_disposition()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if not exists (select 1 from public.properties p where p.id = new.property_id) then
    raise exception 'DISPOSITION_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.inheritance_case and new.date_of_death is null then
    raise exception 'DISPOSITION_DEATH_DATE_REQUIRED' using errcode = '22023';
  end if;
  if new.decedent_contact_id is not null
     and not exists (select 1 from public.contacts c where c.id = new.decedent_contact_id) then
    raise exception 'DISPOSITION_DECEDENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.succession_proof_issued_on is not null and new.succession_proof_issued_on > current_date then
    raise exception 'DISPOSITION_PROOF_DATE_IN_FUTURE' using errcode = '22023';
  end if;
  if new.land_register_corrected and new.land_register_corrected_on is null then
    raise exception 'DISPOSITION_LAND_REGISTER_DATE_REQUIRED' using errcode = '22023';
  end if;
  if new.spousal_consent_given_on is not null and new.spousal_consent_given_on > current_date then
    raise exception 'DISPOSITION_SPOUSAL_DATE_IN_FUTURE' using errcode = '22023';
  end if;
  if new.reviewed_on is not null and new.reviewed_by is null then
    raise exception 'DISPOSITION_REVIEWER_REQUIRED' using errcode = '22023';
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_property_disposition_party()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_structure text;
  v_total numeric;
begin
  select d.ownership_structure into v_structure from public.property_dispositions d where d.id = new.disposition_id;
  if v_structure is null then
    raise exception 'DISPOSITION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.contacts c where c.id = new.contact_id) then
    raise exception 'DISPOSITION_CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.party_role in ('ATTORNEY_IN_FACT','LEGAL_GUARDIAN','SUPPLEMENTARY_CURATOR') and new.represents_contact_id is null then
    raise exception 'DISPOSITION_REPRESENTED_CONTACT_REQUIRED' using errcode = '22023';
  end if;
  if new.represents_contact_id is not null and new.represents_contact_id = new.contact_id then
    raise exception 'DISPOSITION_REPRESENTED_CONTACT_MUST_DIFFER' using errcode = '22023';
  end if;
  if new.represents_contact_id is not null
     and not exists (select 1 from public.contacts c where c.id = new.represents_contact_id) then
    raise exception 'DISPOSITION_REPRESENTED_CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.party_role in ('LEGAL_GUARDIAN','SUPPLEMENTARY_CURATOR') and coalesce(btrim(new.supervising_court),'') = '' then
    raise exception 'DISPOSITION_COURT_REQUIRED' using errcode = '22023';
  end if;
  if new.power_of_attorney_revoked_on is not null and new.power_of_attorney_revoked_on > current_date then
    raise exception 'DISPOSITION_REVOCATION_IN_FUTURE' using errcode = '22023';
  end if;
  if new.court_approval_granted_on is not null and new.court_approval_granted_on > current_date then
    raise exception 'DISPOSITION_APPROVAL_IN_FUTURE' using errcode = '22023';
  end if;
  -- Ein widerrufener oder abgelaufener Bevollmaechtigter kann nicht zugleich als
  -- zustimmend gefuehrt werden; das waere ein Nachweis, den es nicht gibt.
  if new.party_role = 'ATTORNEY_IN_FACT' and new.consent_status = 'GIVEN'
     and new.power_of_attorney_revoked_on is not null
     and new.consent_on is not null and new.consent_on > new.power_of_attorney_revoked_on then
    raise exception 'DISPOSITION_CONSENT_AFTER_REVOCATION' using errcode = '22023';
  end if;
  -- Quoten einer Erbengemeinschaft duerfen zusammen 100 Prozent nicht ueberschreiten.
  if new.share_percentage is not null and new.party_role in ('OWNER','CO_HEIR') then
    select coalesce(sum(p.share_percentage),0) into v_total
    from public.property_disposition_parties p
    where p.disposition_id = new.disposition_id
      and p.party_role in ('OWNER','CO_HEIR')
      and p.archived_at is null
      and p.id is distinct from new.id;
    if v_total + new.share_percentage > 100.001 then
      raise exception 'DISPOSITION_SHARES_EXCEED_TOTAL' using errcode = '22023';
    end if;
  end if;
  if tg_op = 'UPDATE' and old.archived_at is not null and new.archived_at is not null
     and row(new.party_role,new.share_percentage,new.consent_status,new.consent_on,new.court_approval_granted_on)
         is distinct from
         row(old.party_role,old.share_percentage,old.consent_status,old.consent_on,old.court_approval_granted_on) then
    raise exception 'ARCHIVED_DISPOSITION_PARTY_IMMUTABLE' using errcode = '22023';
  end if;
  return new;
end;
$function$;

-- Statusaussage fuer den Abschlussvorgang: bewusst nur Zaehlstaende und Ja/Nein,
-- damit die Warnung auch ohne Leserecht auf die Nachlassangaben erscheinen kann.
create or replace function public.disposition_closing_status(p_closing_id uuid)
returns table(
  has_record boolean,
  ownership_structure text,
  inheritance_case boolean,
  succession_proof_issued boolean,
  land_register_corrected boolean,
  consents_open integer,
  consents_refused integer,
  approvals_outstanding integer,
  attorney_revoked integer,
  spousal_consent_missing boolean
)
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
declare
  v_property uuid;
  v_disposition public.property_dispositions%rowtype;
begin
  if not app_private.has_permission('closing.read') then
    raise exception 'CLOSING_READ_REQUIRED' using errcode = '42501';
  end if;
  select sc.property_id into v_property from public.sale_closings sc where sc.id = p_closing_id;
  if v_property is null then return; end if;

  select * into v_disposition from public.property_dispositions d where d.property_id = v_property;

  has_record := v_disposition.id is not null;
  ownership_structure := coalesce(v_disposition.ownership_structure,'UNKNOWN');
  inheritance_case := coalesce(v_disposition.inheritance_case,false);
  succession_proof_issued := v_disposition.succession_proof_issued_on is not null;
  land_register_corrected := coalesce(v_disposition.land_register_corrected,false);
  spousal_consent_missing := coalesce(v_disposition.spousal_consent_required,false)
    and v_disposition.spousal_consent_given_on is null;
  consents_open := coalesce((select count(*)::int from public.property_disposition_parties p
    where p.disposition_id = v_disposition.id and p.archived_at is null and p.consent_status = 'OPEN'),0);
  consents_refused := coalesce((select count(*)::int from public.property_disposition_parties p
    where p.disposition_id = v_disposition.id and p.archived_at is null and p.consent_status = 'REFUSED'),0);
  approvals_outstanding := coalesce((select count(*)::int from public.property_disposition_parties p
    where p.disposition_id = v_disposition.id and p.archived_at is null
      and p.court_approval_required and p.court_approval_granted_on is null),0);
  attorney_revoked := coalesce((select count(*)::int from public.property_disposition_parties p
    where p.disposition_id = v_disposition.id and p.archived_at is null
      and p.party_role = 'ATTORNEY_IN_FACT' and p.power_of_attorney_revoked_on is not null),0);
  return next;
end;
$function$;

comment on function public.disposition_closing_status(uuid) is 'Liefert dem Abschlussvorgang nur den Erfassungsstand der Verfuegungsberechtigung, ohne Personendaten aus dem Nachlass oder der Betreuung.';

revoke all on function public.disposition_closing_status(uuid) from public;
revoke execute on function public.disposition_closing_status(uuid) from anon;
grant execute on function public.disposition_closing_status(uuid) to authenticated;

alter table public.property_dispositions enable row level security;
alter table public.property_disposition_parties enable row level security;

drop policy if exists property_dispositions_select on public.property_dispositions;
create policy property_dispositions_select on public.property_dispositions for select to authenticated
using ((select app_private.has_permission('disposition.read')));

drop policy if exists property_dispositions_insert on public.property_dispositions;
create policy property_dispositions_insert on public.property_dispositions for insert to authenticated
with check ((select app_private.has_permission('disposition.write')) and created_by = (select auth.uid()));

drop policy if exists property_dispositions_update on public.property_dispositions;
create policy property_dispositions_update on public.property_dispositions for update to authenticated
using ((select app_private.has_permission('disposition.write')))
with check ((select app_private.has_permission('disposition.write')));

drop policy if exists property_disposition_parties_select on public.property_disposition_parties;
create policy property_disposition_parties_select on public.property_disposition_parties for select to authenticated
using ((select app_private.has_permission('disposition.read')));

drop policy if exists property_disposition_parties_insert on public.property_disposition_parties;
create policy property_disposition_parties_insert on public.property_disposition_parties for insert to authenticated
with check ((select app_private.has_permission('disposition.write')) and created_by = (select auth.uid()));

drop policy if exists property_disposition_parties_update on public.property_disposition_parties;
create policy property_disposition_parties_update on public.property_disposition_parties for update to authenticated
using ((select app_private.has_permission('disposition.write')))
with check ((select app_private.has_permission('disposition.write')));

drop policy if exists property_disposition_parties_delete on public.property_disposition_parties;
create policy property_disposition_parties_delete on public.property_disposition_parties for delete to authenticated
using ((select app_private.has_permission('disposition.write')));

drop trigger if exists property_dispositions_10_validate on public.property_dispositions;
create trigger property_dispositions_10_validate before insert or update on public.property_dispositions
for each row execute function app_private.validate_property_disposition();

drop trigger if exists property_dispositions_40_metadata on public.property_dispositions;
create trigger property_dispositions_40_metadata before update on public.property_dispositions
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists property_dispositions_90_audit on public.property_dispositions;
create trigger property_dispositions_90_audit after insert or update or delete on public.property_dispositions
for each row execute function app_private.audit_property_child('DISPOSITION');

drop trigger if exists property_disposition_parties_10_validate on public.property_disposition_parties;
create trigger property_disposition_parties_10_validate before insert or update on public.property_disposition_parties
for each row execute function app_private.validate_property_disposition_party();

drop trigger if exists property_disposition_parties_20_archive_guard on public.property_disposition_parties;
create trigger property_disposition_parties_20_archive_guard before update on public.property_disposition_parties
for each row execute function app_private.enforce_archive_permission('disposition.archive');

drop trigger if exists property_disposition_parties_40_metadata on public.property_disposition_parties;
create trigger property_disposition_parties_40_metadata before update on public.property_disposition_parties
for each row execute function app_private.set_standard_update_metadata();

grant select, insert, update on public.property_dispositions to authenticated;
grant select, insert, update, delete on public.property_disposition_parties to authenticated;
