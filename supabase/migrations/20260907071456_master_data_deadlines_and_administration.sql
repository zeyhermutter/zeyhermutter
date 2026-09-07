-- Thema 13 (Maklerpraxis): Stammdaten, Fristen und Verwaltung.
--
-- Sammelthema fuer die kleinen fachlichen Feinheiten. Kein neues Modul, sondern
-- vier Ergaenzungen an vorhandenen Strukturen:
--
--   1. Kontaktrollen, die in der Praxis fehlen.
--   2. Dokumentkategorien, die in der Praxis fehlen. Bestehende Kategorien
--      werden nicht umbenannt und nicht angefasst.
--   3. Reaktionszeit fuer Anfragen: Zielzeit, sichtbare Ueberschreitung,
--      Eskalation als Wiedervorlage in der bestehenden Aufgabenverwaltung.
--   4. Weiterbildungsnachweis je Benutzer mit Summe im laufenden Zeitraum.
--
-- Dazu die Aufbewahrungsuebersicht aus Thema 3: sie kannte bisher nur die
-- Geldwaescheunterlagen. Jetzt gibt es Regeln je Dokumentart, die beim Anlegen
-- greifen. Bestehende Dokumente bleiben unveraendert.

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
insert into public.permissions(key,description) values
  ('training.read','Weiterbildungsnachweise lesen'),
  ('training.write','Eigene Weiterbildungsnachweise pflegen'),
  ('training.manage','Weiterbildungsnachweise aller Benutzer pflegen'),
  ('retention.manage','Aufbewahrungsregeln pflegen'),
  ('inquiry.escalate','Ueberschrittene Reaktionszeiten eskalieren')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('training.read','training.write','inquiry.escalate')
where r.key in ('admin','managing_director','agent','assistance')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('training.manage','retention.manage')
where r.key in ('admin','managing_director')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1. Kontaktrollen
-- ---------------------------------------------------------------------------
-- Nur ergaenzen. Bestehende Schluessel und Namen bleiben unberuehrt; deshalb
-- "do nothing" statt "do update".
insert into public.contact_roles(key,name) values
  ('INSURER','Versicherer'),
  ('TENANT_IN_SALE','Mieter im Verkaufsfall'),
  ('CO_OWNER','Miteigentümer'),
  ('SURVEYOR','Vermessungsingenieur'),
  ('ARCHITECT','Architekt'),
  ('AUTHORITY','Behörde'),
  ('INTERPRETER','Dolmetscher'),
  ('HOA_ADVISORY_BOARD','Verwaltungsbeirat')
on conflict (key) do nothing;

comment on table public.contact_roles is 'Rollen, in denen ein Kontakt auftreten kann. Die Rolle beschreibt die Funktion im Vorgang, nicht die Berechtigung. "Mieter im Verkaufsfall" steht neben "Mieter", weil im Verkaufsfall eigene Mitteilungs- und Fristfragen entstehen.';

-- ---------------------------------------------------------------------------
-- 2. Dokumentkategorien
-- ---------------------------------------------------------------------------
-- Der bestehende CHECK wird ersetzt, aber nur erweitert: alle bisherigen Werte
-- bleiben unveraendert enthalten.
alter table public.documents drop constraint if exists documents_category_check;
alter table public.documents add constraint documents_category_check check (category in (
  -- bisher vorhanden, unveraendert
  'LAND_REGISTER','CADASTRAL_MAP','FLOOR_PLAN','LIVING_AREA_CALCULATION','ENERGY_CERTIFICATE',
  'DECLARATION_OF_DIVISION','BUILDING_DOCUMENTS','TENANCY_AGREEMENT','WEG','BUSINESS_PLAN',
  'MINUTES','BROKERAGE_AGREEMENT','PHOTOS','NOTARY','INVOICE','IDENTITY_PROOF','OTHER',
  -- neu in Thema 13
  'BUILDING_ENCUMBRANCE_REGISTER','CONTAMINATION_REGISTER','SUCCESSION_PROOF','POWER_OF_ATTORNEY',
  'GUARDIANSHIP_PROOF','WITHDRAWAL_INSTRUCTION','PROPERTY_DISCLOSURE','RESERVATION_AGREEMENT',
  'FINANCING_CONFIRMATION','SERVICE_CHARGE_STATEMENT','RESOLUTION_COLLECTION','HANDOVER_PROTOCOL',
  'TRAINING_CERTIFICATE'
));

comment on column public.documents.category is 'Dokumentart. Bestehende Werte werden nie umbenannt; neue Arten kommen hinzu. TRAINING_CERTIFICATE traegt den Nachweis einer Weiterbildungsmassnahme.';

-- Ein Weiterbildungsnachweis gehoert weder zu einer Immobilie noch zu einem
-- Kontakt, sondern zu einem Benutzer. Die bestehende Bedingung wird deshalb um
-- genau diesen Fall erweitert, nicht gelockert.
alter table public.documents drop constraint if exists documents_check;
alter table public.documents add constraint documents_check check (
  property_id is not null or contact_id is not null or category = 'TRAINING_CERTIFICATE'
);

-- ---------------------------------------------------------------------------
-- Aufbewahrung: Regeln je Dokumentart
-- ---------------------------------------------------------------------------
create table if not exists public.document_retention_rules (
  id uuid primary key default gen_random_uuid(),
  category text not null unique,
  retention_category text not null,
  retention_years integer not null check (retention_years >= 0 and retention_years <= 100),
  -- Die Begruendung schreibt der Benutzer. Die Software behauptet nicht, eine
  -- Frist sei rechtlich zutreffend.
  basis_note text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid constraint document_retention_rules_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint document_retention_rules_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0)
);

comment on table public.document_retention_rules is 'Voreinstellung der Aufbewahrung je Dokumentart. Die Werte sind konfigurierbar und ausdruecklich keine rechtliche Aussage; sie greifen nur beim Anlegen neuer Dokumente ohne eigene Frist.';

insert into public.document_retention_rules(category,retention_category,retention_years,basis_note) values
  ('IDENTITY_PROOF','GWG_IDENTIFICATION',5,'Aus Thema 3 uebernommen.'),
  ('BROKERAGE_AGREEMENT','CONTRACT',10,null),
  ('NOTARY','CONTRACT',10,null),
  ('RESERVATION_AGREEMENT','CONTRACT',10,null),
  ('WITHDRAWAL_INSTRUCTION','CONTRACT',10,null),
  ('PROPERTY_DISCLOSURE','EVIDENCE',10,null),
  ('HANDOVER_PROTOCOL','EVIDENCE',10,null),
  ('FINANCING_CONFIRMATION','FINANCIAL',6,null),
  ('INVOICE','FINANCIAL',10,null),
  ('SERVICE_CHARGE_STATEMENT','FINANCIAL',6,null),
  ('SUCCESSION_PROOF','LEGAL_CAPACITY',10,null),
  ('POWER_OF_ATTORNEY','LEGAL_CAPACITY',10,null),
  ('GUARDIANSHIP_PROOF','LEGAL_CAPACITY',10,null),
  ('TENANCY_AGREEMENT','PROPERTY',10,null),
  ('RESOLUTION_COLLECTION','PROPERTY',10,null),
  ('BUILDING_ENCUMBRANCE_REGISTER','PROPERTY',10,null),
  ('CONTAMINATION_REGISTER','PROPERTY',10,null),
  ('TRAINING_CERTIFICATE','TRAINING',5,null)
on conflict (category) do nothing;

create index if not exists document_retention_rules_created_by_idx on public.document_retention_rules(created_by);
create index if not exists document_retention_rules_updated_by_idx on public.document_retention_rules(updated_by);

-- ---------------------------------------------------------------------------
-- 3. Reaktionszeit fuer Anfragen
-- ---------------------------------------------------------------------------
create table if not exists public.inquiry_response_targets (
  id uuid primary key default gen_random_uuid(),
  -- null heisst: gilt fuer alle Kanaele ohne eigene Zielzeit.
  channel text unique check (channel is null or channel in ('WEBSITE','PORTAL','PHONE','EMAIL','REFERRAL','WALK_IN','OTHER')),
  target_hours integer not null check (target_hours > 0 and target_hours <= 720),
  escalation_hours integer not null check (escalation_hours > 0 and escalation_hours <= 2160),
  active boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid constraint inquiry_response_targets_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint inquiry_response_targets_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),
  constraint inquiry_response_targets_order_check check (escalation_hours >= target_hours)
);

comment on table public.inquiry_response_targets is 'Zielzeit bis zur ersten Antwort auf eine Anfrage, je Kanal. Die Zeile ohne Kanal ist die allgemeine Vorgabe.';
comment on column public.inquiry_response_targets.escalation_hours is 'Ab dieser Ueberschreitung laesst sich eine Wiedervorlage erzeugen. Das System legt sie nicht von selbst an.';

-- Ein Teilindex statt eines unique-Constraints, weil null in unique nicht greift.
create unique index if not exists inquiry_response_targets_default_idx
  on public.inquiry_response_targets((channel is null)) where channel is null;

insert into public.inquiry_response_targets(channel,target_hours,escalation_hours,note)
select null,24,48,'Allgemeine Vorgabe. Zwei Werktage entsprechen ungefähr 48 Stunden.'
where not exists (select 1 from public.inquiry_response_targets where channel is null);

insert into public.inquiry_response_targets(channel,target_hours,escalation_hours,note) values
  ('PHONE',4,24,'Ein Rückruf verträgt keine 24 Stunden.'),
  ('WEBSITE',12,48,null),
  ('PORTAL',12,48,null)
on conflict (channel) do nothing;

create index if not exists inquiry_response_targets_created_by_idx on public.inquiry_response_targets(created_by);
create index if not exists inquiry_response_targets_updated_by_idx on public.inquiry_response_targets(updated_by);

-- Die Eskalation ist eine ganz normale Aufgabe. Eine Spalte kennzeichnet sie,
-- ein Teilindex verhindert Doppelungen.
alter table public.tasks add column if not exists response_escalation boolean not null default false;
comment on column public.tasks.response_escalation is 'Wiedervorlage aus einer ueberschrittenen Reaktionszeit. Verhindert zusammen mit inquiry_id, dass dieselbe Anfrage mehrfach eskaliert wird.';

create unique index if not exists tasks_response_escalation_unique_idx
  on public.tasks(inquiry_id) where inquiry_id is not null and response_escalation;

-- ---------------------------------------------------------------------------
-- 4. Weiterbildungsnachweis
-- ---------------------------------------------------------------------------
create table if not exists public.training_settings (
  id boolean primary key default true check (id),
  required_hours numeric(6,2) not null default 20 check (required_hours >= 0),
  period_years integer not null default 3 check (period_years between 1 and 10),
  period_start date not null default date_trunc('year', now())::date,
  note text,
  updated_at timestamptz not null default now(),
  updated_by uuid constraint training_settings_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0)
);

comment on table public.training_settings is 'Zielwert der Weiterbildung: Stunden je Zeitraum. Voreinstellung 20 Stunden in drei Jahren; die Zahl ist konfigurierbar und ausdruecklich keine rechtliche Aussage der Software.';

insert into public.training_settings(id,note)
values (true,'Voreinstellung. Ob und in welchem Umfang eine Weiterbildungspflicht besteht, ist anwaltlich zu klären.')
on conflict (id) do nothing;

create table if not exists public.user_training_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null constraint user_training_records_user_id_fkey references public.profiles(user_id) on delete cascade,
  title text not null,
  provider text,
  topic text,
  completed_on date not null,
  hours numeric(6,2) not null check (hours > 0 and hours <= 500),
  format text check (format is null or format in ('IN_PERSON','ONLINE_LIVE','SELF_STUDY','BLENDED','OTHER')),
  document_id uuid constraint user_training_records_document_id_fkey references public.documents(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid constraint user_training_records_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint user_training_records_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  archived_at timestamptz,
  archived_by uuid constraint user_training_records_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),
  constraint user_training_records_title_check check (length(btrim(title)) > 0)
);

comment on table public.user_training_records is 'Einzelne Weiterbildungsmassnahme eines Benutzers. Der Nachweis liegt als Dokument in der Dokumentenakte; hier steht die auswertbare Angabe.';

create index if not exists user_training_records_user_idx on public.user_training_records(user_id, completed_on);
create index if not exists user_training_records_document_idx on public.user_training_records(document_id);
create index if not exists user_training_records_created_by_idx on public.user_training_records(created_by);
create index if not exists user_training_records_updated_by_idx on public.user_training_records(updated_by);
create index if not exists user_training_records_archived_by_idx on public.user_training_records(archived_by);

-- ---------------------------------------------------------------------------
-- Funktionen
-- ---------------------------------------------------------------------------
-- Reaktionszeit je Anfrage: gerechnet, nicht gespeichert.
create or replace function public.inquiry_response_overview(p_only_open boolean default true)
returns table (
  inquiry_id uuid,
  inquiry_number text,
  channel text,
  status text,
  received_at timestamptz,
  answered_at timestamptz,
  responsible_user uuid,
  target_hours integer,
  escalation_hours integer,
  elapsed_hours numeric,
  state text,
  escalated boolean
)
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
  with target as (
    select i.id,
           coalesce(specific.target_hours, general.target_hours) as target_hours,
           coalesce(specific.escalation_hours, general.escalation_hours) as escalation_hours
      from public.inquiries i
      left join public.inquiry_response_targets specific
        on specific.channel = i.channel and specific.active
      left join public.inquiry_response_targets general
        on general.channel is null and general.active
  )
  select
    i.id,
    i.inquiry_number,
    i.channel,
    i.status,
    i.received_at,
    i.answered_at,
    i.primary_responsible_user,
    t.target_hours,
    t.escalation_hours,
    round(extract(epoch from (coalesce(i.answered_at, now()) - i.received_at)) / 3600.0, 1) as elapsed_hours,
    case
      when t.target_hours is null then 'NO_TARGET'
      when i.answered_at is not null and extract(epoch from (i.answered_at - i.received_at)) / 3600.0 <= t.target_hours then 'ANSWERED_IN_TIME'
      when i.answered_at is not null then 'ANSWERED_LATE'
      when extract(epoch from (now() - i.received_at)) / 3600.0 > t.escalation_hours then 'ESCALATION_DUE'
      when extract(epoch from (now() - i.received_at)) / 3600.0 > t.target_hours then 'OVERDUE'
      else 'IN_TIME'
    end as state,
    exists (select 1 from public.tasks tk
             where tk.inquiry_id = i.id and tk.response_escalation and tk.archived_at is null) as escalated
  from public.inquiries i
  join target t on t.id = i.id
  where i.archived_at is null
    and i.received_at is not null
    and (not p_only_open or i.answered_at is null)
  order by i.received_at;
$function$;

revoke execute on function public.inquiry_response_overview(boolean) from anon;
grant execute on function public.inquiry_response_overview(boolean) to authenticated;

-- Weiterbildung je Benutzer im laufenden Zeitraum.
create or replace function public.user_training_summary()
returns table (
  user_id uuid,
  display_name text,
  period_from date,
  period_to date,
  required_hours numeric,
  achieved_hours numeric,
  remaining_hours numeric,
  records integer,
  last_completed_on date,
  days_left integer
)
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
  with settings as (
    select required_hours, period_years, period_start from public.training_settings where id
  ),
  period as (
    -- Der laufende Zeitraum ist der aktuelle Abschnitt seit dem Startdatum.
    -- Ueber volle Jahre gerechnet, damit kein Rundungsdrift entsteht.
    select s.required_hours,
           s.period_years,
           (s.period_start + make_interval(years =>
             s.period_years * (extract(year from age(current_date, s.period_start))::integer / s.period_years)
           ))::date as period_from
      from settings s
  )
  select
    p.user_id,
    p.display_name,
    pr.period_from,
    (pr.period_from + make_interval(years => pr.period_years) - interval '1 day')::date as period_to,
    pr.required_hours,
    coalesce(sum(r.hours) filter (where r.completed_on >= pr.period_from), 0)::numeric as achieved_hours,
    greatest(pr.required_hours - coalesce(sum(r.hours) filter (where r.completed_on >= pr.period_from), 0), 0)::numeric as remaining_hours,
    count(r.id) filter (where r.completed_on >= pr.period_from)::integer as records,
    max(r.completed_on) as last_completed_on,
    ((pr.period_from + make_interval(years => pr.period_years) - interval '1 day')::date - current_date)::integer as days_left
  from public.profiles p
  cross join period pr
  left join public.user_training_records r
    on r.user_id = p.user_id and r.archived_at is null
  where p.status = 'ACTIVE'
  group by p.user_id, p.display_name, pr.period_from, pr.required_hours, pr.period_years
  order by p.display_name;
$function$;

revoke execute on function public.user_training_summary() from anon;
grant execute on function public.user_training_summary() to authenticated;

-- ---------------------------------------------------------------------------
-- Regeln
-- ---------------------------------------------------------------------------
-- Aufbewahrung beim Anlegen setzen. Bestehende Angaben werden nie ueberschrieben.
create or replace function app_private.apply_document_retention_rule()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_rule public.document_retention_rules%rowtype;
begin
  if new.retention_category is not null and new.retention_until is not null then
    return new;
  end if;
  select * into v_rule from public.document_retention_rules
   where category = new.category and active;
  if v_rule.id is null then
    return new;
  end if;
  if new.retention_category is null then
    new.retention_category := v_rule.retention_category;
  end if;
  if new.retention_until is null then
    new.retention_until := (coalesce(new.created_at, now())::date + make_interval(years => v_rule.retention_years))::date;
  end if;
  if new.deletion_eligible_at is null then
    new.deletion_eligible_at := new.retention_until;
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_training_record()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if new.completed_on > current_date then
    raise exception 'TRAINING_COMPLETED_IN_FUTURE' using errcode = '22023';
  end if;
  if new.completed_on < current_date - 3650 then
    raise exception 'TRAINING_COMPLETED_TOO_LONG_AGO' using errcode = '22023';
  end if;
  -- Fremde Nachweise pflegt nur, wer training.manage hat.
  if new.user_id <> coalesce(auth.uid(), new.user_id)
     and not app_private.has_permission('training.manage') then
    raise exception 'TRAINING_FOREIGN_USER_REQUIRES_MANAGE' using errcode = '42501';
  end if;
  if new.document_id is not null
     and not exists (select 1 from public.documents d where d.id = new.document_id and d.category = 'TRAINING_CERTIFICATE') then
    raise exception 'TRAINING_DOCUMENT_WRONG_CATEGORY' using errcode = '22023';
  end if;
  return new;
end;
$function$;

-- Ueberschrittene Reaktionszeiten als Wiedervorlage. Ausdruecklich ein
-- angestossener Vorgang: das System legt nichts im Hintergrund an.
create or replace function public.escalate_overdue_inquiries()
returns integer
language plpgsql
volatile
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_row record;
  v_count integer := 0;
begin
  if not app_private.has_permission('inquiry.escalate') then
    raise exception 'INQUIRY_ESCALATE_REQUIRED' using errcode = '42501';
  end if;

  for v_row in
    select o.inquiry_id, o.inquiry_number, o.responsible_user, o.elapsed_hours, o.target_hours,
           i.contact_id, i.property_id
      from public.inquiry_response_overview(true) o
      join public.inquiries i on i.id = o.inquiry_id
     where o.state = 'ESCALATION_DUE' and not o.escalated
  loop
    -- Ohne Verantwortlichen gaebe es niemanden, dem die Wiedervorlage gehoert.
    if v_row.responsible_user is not null then
      insert into public.tasks(title, description, due_at, responsible_user, contact_id,
                               property_id, inquiry_id, response_escalation, priority)
      values ('Anfrage ' || v_row.inquiry_number || ' ist unbeantwortet',
              'Die Zielzeit von ' || v_row.target_hours
                || case when v_row.target_hours = 1 then ' Stunde' else ' Stunden' end
                || ' ist überschritten. Erfasst wurde die Anfrage vor rund '
                || round(v_row.elapsed_hours)
                || case when round(v_row.elapsed_hours) = 1 then ' Stunde.' else ' Stunden.' end,
              now(), v_row.responsible_user, v_row.contact_id, v_row.property_id,
              v_row.inquiry_id, true, 'HIGH')
      on conflict do nothing;
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$function$;

revoke execute on function public.escalate_overdue_inquiries() from anon;
grant execute on function public.escalate_overdue_inquiries() to authenticated;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.document_retention_rules enable row level security;

drop policy if exists document_retention_rules_select on public.document_retention_rules;
create policy document_retention_rules_select on public.document_retention_rules for select to authenticated
using ((select app_private.has_permission('document.read')));

drop policy if exists document_retention_rules_insert on public.document_retention_rules;
create policy document_retention_rules_insert on public.document_retention_rules for insert to authenticated
with check ((select app_private.has_permission('retention.manage')) and created_by = (select auth.uid()));

drop policy if exists document_retention_rules_update on public.document_retention_rules;
create policy document_retention_rules_update on public.document_retention_rules for update to authenticated
using ((select app_private.has_permission('retention.manage')))
with check ((select app_private.has_permission('retention.manage')));

alter table public.inquiry_response_targets enable row level security;

drop policy if exists inquiry_response_targets_select on public.inquiry_response_targets;
create policy inquiry_response_targets_select on public.inquiry_response_targets for select to authenticated
using ((select app_private.has_permission('inquiry.read')));

drop policy if exists inquiry_response_targets_insert on public.inquiry_response_targets;
create policy inquiry_response_targets_insert on public.inquiry_response_targets for insert to authenticated
with check ((select app_private.has_permission('settings.manage')) and created_by = (select auth.uid()));

drop policy if exists inquiry_response_targets_update on public.inquiry_response_targets;
create policy inquiry_response_targets_update on public.inquiry_response_targets for update to authenticated
using ((select app_private.has_permission('settings.manage')))
with check ((select app_private.has_permission('settings.manage')));

alter table public.training_settings enable row level security;

drop policy if exists training_settings_select on public.training_settings;
create policy training_settings_select on public.training_settings for select to authenticated
using ((select app_private.has_permission('training.read')));

drop policy if exists training_settings_update on public.training_settings;
create policy training_settings_update on public.training_settings for update to authenticated
using ((select app_private.has_permission('training.manage')))
with check ((select app_private.has_permission('training.manage')));

alter table public.user_training_records enable row level security;

-- Eigene Nachweise sieht jeder mit training.read; fremde nur mit training.manage.
drop policy if exists user_training_records_select on public.user_training_records;
create policy user_training_records_select on public.user_training_records for select to authenticated
using (
  (select app_private.has_permission('training.manage'))
  or ((select app_private.has_permission('training.read')) and user_id = (select auth.uid()))
);

drop policy if exists user_training_records_insert on public.user_training_records;
create policy user_training_records_insert on public.user_training_records for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (
    (select app_private.has_permission('training.manage'))
    or ((select app_private.has_permission('training.write')) and user_id = (select auth.uid()))
  )
);

drop policy if exists user_training_records_update on public.user_training_records;
create policy user_training_records_update on public.user_training_records for update to authenticated
using (
  (select app_private.has_permission('training.manage'))
  or ((select app_private.has_permission('training.write')) and user_id = (select auth.uid()))
)
with check (
  (select app_private.has_permission('training.manage'))
  or ((select app_private.has_permission('training.write')) and user_id = (select auth.uid()))
);

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
drop trigger if exists documents_15_retention_rule on public.documents;
create trigger documents_15_retention_rule before insert on public.documents
for each row execute function app_private.apply_document_retention_rule();

drop trigger if exists document_retention_rules_40_metadata on public.document_retention_rules;
create trigger document_retention_rules_40_metadata before update on public.document_retention_rules
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists document_retention_rules_90_audit on public.document_retention_rules;
create trigger document_retention_rules_90_audit after insert or update or delete on public.document_retention_rules
for each row execute function app_private.audit_row_change('RETENTION_RULE','category');

drop trigger if exists inquiry_response_targets_40_metadata on public.inquiry_response_targets;
create trigger inquiry_response_targets_40_metadata before update on public.inquiry_response_targets
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists inquiry_response_targets_90_audit on public.inquiry_response_targets;
create trigger inquiry_response_targets_90_audit after insert or update or delete on public.inquiry_response_targets
for each row execute function app_private.audit_row_change('RESPONSE_TARGET','channel');

drop trigger if exists training_settings_40_metadata on public.training_settings;
create trigger training_settings_40_metadata before update on public.training_settings
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists user_training_records_10_validate on public.user_training_records;
create trigger user_training_records_10_validate before insert or update on public.user_training_records
for each row execute function app_private.validate_training_record();

drop trigger if exists user_training_records_20_archive_guard on public.user_training_records;
create trigger user_training_records_20_archive_guard before update on public.user_training_records
for each row execute function app_private.enforce_archive_permission('training.manage');

drop trigger if exists user_training_records_40_metadata on public.user_training_records;
create trigger user_training_records_40_metadata before update on public.user_training_records
for each row execute function app_private.set_business_update_metadata();

drop trigger if exists user_training_records_90_audit on public.user_training_records;
create trigger user_training_records_90_audit after insert or update or delete on public.user_training_records
for each row execute function app_private.audit_row_change('TRAINING_RECORD','title');

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update on public.document_retention_rules to authenticated;
grant select, insert, update on public.inquiry_response_targets to authenticated;
grant select, update on public.training_settings to authenticated;
grant select, insert, update on public.user_training_records to authenticated;
