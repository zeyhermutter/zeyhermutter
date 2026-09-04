-- Thema 10 (Maklerpraxis): Akquisehierarchie, Kampagnen und Partnersteuerung.
-- Bisher gab es nur zehn grobe lead_sources. Die bleiben die Kanalebene und
-- werden relational angebunden, nicht ersetzt.
--
-- Kette: Kanal (lead_sources) -> Kampagne -> Gebiet -> Welle -> Werbemittel ->
-- CTA -> Reaktion -> Termin -> Vorgang.
--
-- Die Zuordnung eines Leads liegt bewusst in einer eigenen Tabelle und nicht in
-- public.leads: ein umgewandelter Lead ist dort vollstaendig schreibgeschuetzt,
-- eine spaetere Korrektur der Herkunft waere sonst unmoeglich.

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
insert into public.permissions(key,description) values
  ('acquisition.read','Akquise, Kampagnen und Gebiete lesen'),
  ('acquisition.write','Akquise, Kampagnen und Gebiete bearbeiten'),
  ('acquisition.archive','Kampagnen und Gebiete archivieren')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('acquisition.read','acquisition.write')
where r.key in ('admin','managing_director','agent','assistance')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key = 'acquisition.archive'
where r.key in ('admin','managing_director')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Gebiete: Muenchen -> Trudering -> Waldtrudering
-- ---------------------------------------------------------------------------
create table if not exists public.acquisition_areas (
  id uuid primary key default gen_random_uuid(),
  parent_area_id uuid constraint acquisition_areas_parent_area_id_fkey references public.acquisition_areas(id) on delete restrict,
  name text not null check (coalesce(btrim(name),'') <> ''),
  area_type text not null default 'DISTRICT' check (area_type in ('CITY','DISTRICT','QUARTER','REGION','OTHER')),
  postal_code text,
  household_estimate integer check (household_estimate is null or household_estimate >= 0),
  notes text,

  created_at timestamptz not null default now(),
  created_by uuid constraint acquisition_areas_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint acquisition_areas_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  archived_at timestamptz,
  archived_by uuid constraint acquisition_areas_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0)
);

comment on table public.acquisition_areas is 'Hyperlokale Gebiete als Baum. Ein Gebiet kann Unterbereiche haben; Kampagnen haengen an genau einem Gebiet.';

create unique index if not exists acquisition_areas_unique_root_idx
  on public.acquisition_areas(lower(name)) where parent_area_id is null and archived_at is null;
create unique index if not exists acquisition_areas_unique_child_idx
  on public.acquisition_areas(parent_area_id, lower(name)) where parent_area_id is not null and archived_at is null;
create index if not exists acquisition_areas_parent_idx on public.acquisition_areas(parent_area_id);
create index if not exists acquisition_areas_created_by_idx on public.acquisition_areas(created_by);
create index if not exists acquisition_areas_updated_by_idx on public.acquisition_areas(updated_by);
create index if not exists acquisition_areas_archived_by_idx on public.acquisition_areas(archived_by);

-- ---------------------------------------------------------------------------
-- Kampagnen
-- ---------------------------------------------------------------------------
create sequence if not exists public.acquisition_campaign_number_seq;

create table if not exists public.acquisition_campaigns (
  id uuid primary key default gen_random_uuid(),
  campaign_number text not null unique default ('ZM-KA-' || lpad(nextval('public.acquisition_campaign_number_seq'::regclass)::text, 6, '0')),
  name text not null check (coalesce(btrim(name),'') <> ''),
  area_id uuid not null constraint acquisition_campaigns_area_id_fkey references public.acquisition_areas(id) on delete restrict,
  -- Der Kanal bleibt die bestehende Quellenliste.
  source_id uuid not null constraint acquisition_campaigns_source_id_fkey references public.lead_sources(id) on delete restrict,

  target_group text,
  topic text,
  call_to_action text,
  household_count integer check (household_count is null or household_count >= 0),
  starts_on date,
  ends_on date,
  planned_cost numeric(14,2) check (planned_cost is null or planned_cost >= 0),
  actual_cost numeric(14,2) check (actual_cost is null or actual_cost >= 0),

  status text not null default 'PLANNED' check (status in ('PLANNED','RUNNING','COMPLETED','CANCELLED')),
  notes text,

  primary_responsible_user uuid constraint acquisition_campaigns_primary_responsible_user_fkey references public.profiles(user_id),
  created_at timestamptz not null default now(),
  created_by uuid constraint acquisition_campaigns_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint acquisition_campaigns_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  archived_at timestamptz,
  archived_by uuid constraint acquisition_campaigns_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),

  constraint acquisition_campaigns_period_check check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint acquisition_campaigns_running_dated_check check (status = 'PLANNED' or starts_on is not null)
);

comment on table public.acquisition_campaigns is 'Kampagne in einem Gebiet ueber einen Kanal. Kosten und Haushalte werden erfasst; Reaktionen und Ergebnisse werden aus den zugeordneten Leads gerechnet, nicht hier gespeichert.';

create index if not exists acquisition_campaigns_area_idx on public.acquisition_campaigns(area_id, status);
create index if not exists acquisition_campaigns_source_idx on public.acquisition_campaigns(source_id);
create index if not exists acquisition_campaigns_responsible_idx on public.acquisition_campaigns(primary_responsible_user);
create index if not exists acquisition_campaigns_created_by_idx on public.acquisition_campaigns(created_by);
create index if not exists acquisition_campaigns_updated_by_idx on public.acquisition_campaigns(updated_by);
create index if not exists acquisition_campaigns_archived_by_idx on public.acquisition_campaigns(archived_by);

-- ---------------------------------------------------------------------------
-- Wellen und Werbemittel
-- ---------------------------------------------------------------------------
create table if not exists public.acquisition_waves (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null constraint acquisition_waves_campaign_id_fkey references public.acquisition_campaigns(id) on delete cascade,
  wave_position integer not null check (wave_position > 0),
  name text not null check (coalesce(btrim(name),'') <> ''),
  medium text,
  call_to_action text,
  sent_on date,
  household_count integer check (household_count is null or household_count >= 0),
  cost numeric(14,2) check (cost is null or cost >= 0),
  notes text,

  created_at timestamptz not null default now(),
  created_by uuid constraint acquisition_waves_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint acquisition_waves_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),

  constraint acquisition_waves_unique_position unique (campaign_id, wave_position)
);

comment on table public.acquisition_waves is 'Welle einer Kampagne mit Werbemittel und CTA. Die Welle ist die Ebene, auf der eine Reaktion tatsaechlich zugeordnet werden kann.';

create index if not exists acquisition_waves_campaign_idx on public.acquisition_waves(campaign_id, wave_position);
create index if not exists acquisition_waves_created_by_idx on public.acquisition_waves(created_by);
create index if not exists acquisition_waves_updated_by_idx on public.acquisition_waves(updated_by);

-- ---------------------------------------------------------------------------
-- Herkunft eines Leads
-- ---------------------------------------------------------------------------
create table if not exists public.lead_acquisitions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null unique constraint lead_acquisitions_lead_id_fkey references public.leads(id) on delete cascade,
  campaign_id uuid constraint lead_acquisitions_campaign_id_fkey references public.acquisition_campaigns(id) on delete set null,
  wave_id uuid constraint lead_acquisitions_wave_id_fkey references public.acquisition_waves(id) on delete set null,

  -- Eine Empfehlung zeigt auf den konkreten Partner, nicht auf eine Kategorie.
  referrer_contact_id uuid constraint lead_acquisitions_referrer_contact_id_fkey references public.contacts(id) on delete set null,
  referrer_organization_id uuid constraint lead_acquisitions_referrer_organization_id_fkey references public.organizations(id) on delete set null,

  response_channel text check (response_channel is null or response_channel in ('QR_CODE','PHONE','EMAIL','WEB_FORM','LETTER','IN_PERSON','EVENT','OTHER')),
  response_on date,
  notes text,

  created_at timestamptz not null default now(),
  created_by uuid constraint lead_acquisitions_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint lead_acquisitions_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),

  constraint lead_acquisitions_wave_needs_campaign_check check (wave_id is null or campaign_id is not null)
);

comment on table public.lead_acquisitions is 'Woraus ein Lead entstanden ist. Eigene Tabelle, damit die Herkunft auch nach der Umwandlung des Leads noch korrigiert werden kann.';

create index if not exists lead_acquisitions_campaign_idx on public.lead_acquisitions(campaign_id);
create index if not exists lead_acquisitions_wave_idx on public.lead_acquisitions(wave_id);
create index if not exists lead_acquisitions_referrer_contact_idx on public.lead_acquisitions(referrer_contact_id);
create index if not exists lead_acquisitions_referrer_org_idx on public.lead_acquisitions(referrer_organization_id);
create index if not exists lead_acquisitions_created_by_idx on public.lead_acquisitions(created_by);
create index if not exists lead_acquisitions_updated_by_idx on public.lead_acquisitions(updated_by);

-- ---------------------------------------------------------------------------
-- Partner: Erweiterung von organizations, kein Ersatz
-- ---------------------------------------------------------------------------
create table if not exists public.partner_profiles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null unique constraint partner_profiles_organization_id_fkey references public.organizations(id) on delete cascade,

  trade text,
  service_area text,
  rating_reliability smallint check (rating_reliability is null or rating_reliability between 1 and 5),
  rating_quality smallint check (rating_quality is null or rating_quality between 1 and 5),
  rating_speed smallint check (rating_speed is null or rating_speed between 1 and 5),
  price_level text not null default 'UNKNOWN' check (price_level in ('LOW','MEDIUM','HIGH','UNKNOWN')),
  last_order_on date,
  order_count integer not null default 0 check (order_count >= 0),
  preferred boolean not null default false,
  blocked boolean not null default false,
  blocked_reason text,

  -- Regulierte Berufsgruppen. Reine Kennzeichnung; das System bewertet nicht,
  -- ob eine Zuwendung im Einzelfall zulaessig ist, sondern verhindert nur die
  -- automatische Aufnahme in ein Verguetungsmodell.
  regulated_profession text not null default 'NONE' check (regulated_profession in ('NONE','LAWYER','NOTARY','TAX_ADVISOR','AUDITOR','OTHER_REGULATED')),
  compliance_status text not null default 'LEGAL_REVIEW_REQUIRED' check (compliance_status in ('COMMISSION_POSSIBLE','NO_COMMISSION','LEGAL_REVIEW_REQUIRED','COOPERATION_ONLY')),
  compliance_note text,
  compliance_reviewed_on date,
  compliance_reviewed_by uuid constraint partner_profiles_compliance_reviewed_by_fkey references public.profiles(user_id),
  notes text,

  created_at timestamptz not null default now(),
  created_by uuid constraint partner_profiles_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint partner_profiles_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),

  constraint partner_profiles_blocked_reason_check check (
    not blocked or coalesce(btrim(blocked_reason),'') <> ''
  ),
  constraint partner_profiles_regulated_no_commission_check check (
    regulated_profession = 'NONE' or compliance_status <> 'COMMISSION_POSSIBLE'
  ),
  constraint partner_profiles_blocked_not_preferred_check check (not (blocked and preferred)),
  constraint partner_profiles_commission_reviewed_check check (
    compliance_status <> 'COMMISSION_POSSIBLE' or (compliance_reviewed_on is not null and compliance_reviewed_by is not null)
  )
);

comment on table public.partner_profiles is 'Partner- und Dienstleisterprofil zu einer Organisation. Erweitert organizations, ersetzt es nicht.';
comment on column public.partner_profiles.compliance_status is 'Ob eine Verguetung an diesen Partner ueberhaupt in Frage kommt. Keine rechtliche Bewertung des Einzelfalls.';

create index if not exists partner_profiles_trade_idx on public.partner_profiles(trade);
create index if not exists partner_profiles_compliance_idx on public.partner_profiles(compliance_status);
create index if not exists partner_profiles_reviewed_by_idx on public.partner_profiles(compliance_reviewed_by);
create index if not exists partner_profiles_created_by_idx on public.partner_profiles(created_by);
create index if not exists partner_profiles_updated_by_idx on public.partner_profiles(updated_by);

create table if not exists public.partner_referral_fees (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null constraint partner_referral_fees_organization_id_fkey references public.organizations(id) on delete restrict,
  lead_id uuid constraint partner_referral_fees_lead_id_fkey references public.leads(id) on delete set null,
  property_id uuid constraint partner_referral_fees_property_id_fkey references public.properties(id) on delete set null,
  mandate_id uuid constraint partner_referral_fees_mandate_id_fkey references public.brokerage_mandates(id) on delete set null,

  agreed_on date not null default current_date,
  amount numeric(14,2) not null check (amount >= 0),
  basis text,
  status text not null default 'AGREED' check (status in ('AGREED','INVOICED','PAID','CANCELLED')),
  notes text,

  created_at timestamptz not null default now(),
  created_by uuid constraint partner_referral_fees_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint partner_referral_fees_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0)
);

comment on table public.partner_referral_fees is 'Vereinbarte Verguetung fuer eine Partnerempfehlung. Nur moeglich, wenn das Partnerprofil das ausdruecklich zulaesst.';

create index if not exists partner_referral_fees_organization_idx on public.partner_referral_fees(organization_id, status);
create index if not exists partner_referral_fees_lead_idx on public.partner_referral_fees(lead_id);
create index if not exists partner_referral_fees_property_idx on public.partner_referral_fees(property_id);
create index if not exists partner_referral_fees_mandate_idx on public.partner_referral_fees(mandate_id);
create index if not exists partner_referral_fees_created_by_idx on public.partner_referral_fees(created_by);
create index if not exists partner_referral_fees_updated_by_idx on public.partner_referral_fees(updated_by);

-- ---------------------------------------------------------------------------
-- Regeln
-- ---------------------------------------------------------------------------
create or replace function app_private.validate_acquisition_area()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_cursor uuid;
  v_depth integer := 0;
begin
  if new.parent_area_id is not null then
    if new.parent_area_id = new.id then
      raise exception 'AREA_PARENT_SELF' using errcode = '22023';
    end if;
    if not exists (select 1 from public.acquisition_areas a where a.id = new.parent_area_id) then
      raise exception 'AREA_PARENT_NOT_FOUND' using errcode = 'P0002';
    end if;
    -- Kein Kreis und keine unbegrenzte Tiefe.
    v_cursor := new.parent_area_id;
    while v_cursor is not null loop
      v_depth := v_depth + 1;
      if v_cursor = new.id then
        raise exception 'AREA_PARENT_CYCLE' using errcode = '22023';
      end if;
      if v_depth > 6 then
        raise exception 'AREA_TOO_DEEP' using errcode = '22023';
      end if;
      select parent_area_id into v_cursor from public.acquisition_areas where id = v_cursor;
    end loop;
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_acquisition_campaign()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if not exists (select 1 from public.acquisition_areas a where a.id = new.area_id and a.archived_at is null) then
    raise exception 'CAMPAIGN_AREA_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.lead_sources s where s.id = new.source_id) then
    raise exception 'CAMPAIGN_SOURCE_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.status = 'COMPLETED' and new.ends_on is null then
    raise exception 'CAMPAIGN_END_REQUIRED' using errcode = '22023';
  end if;
  if new.starts_on is not null and new.starts_on > current_date + 730 then
    raise exception 'CAMPAIGN_START_TOO_FAR' using errcode = '22023';
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_acquisition_wave()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_campaign public.acquisition_campaigns%rowtype;
begin
  select * into v_campaign from public.acquisition_campaigns where id = new.campaign_id;
  if v_campaign.id is null then
    raise exception 'WAVE_CAMPAIGN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.sent_on is not null and new.sent_on > current_date then
    raise exception 'WAVE_SENT_IN_FUTURE' using errcode = '22023';
  end if;
  if new.sent_on is not null and v_campaign.starts_on is not null and new.sent_on < v_campaign.starts_on then
    raise exception 'WAVE_BEFORE_CAMPAIGN_START' using errcode = '22023';
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_lead_acquisition()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if not exists (select 1 from public.leads l where l.id = new.lead_id) then
    raise exception 'ACQUISITION_LEAD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.campaign_id is not null
     and not exists (select 1 from public.acquisition_campaigns c where c.id = new.campaign_id) then
    raise exception 'ACQUISITION_CAMPAIGN_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.wave_id is not null
     and not exists (select 1 from public.acquisition_waves w where w.id = new.wave_id and w.campaign_id = new.campaign_id) then
    raise exception 'ACQUISITION_WAVE_MISMATCH' using errcode = '22023';
  end if;
  if new.referrer_contact_id is not null
     and not exists (select 1 from public.contacts c where c.id = new.referrer_contact_id) then
    raise exception 'ACQUISITION_REFERRER_CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.referrer_organization_id is not null
     and not exists (select 1 from public.organizations o where o.id = new.referrer_organization_id) then
    raise exception 'ACQUISITION_REFERRER_ORGANIZATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.response_on is not null and new.response_on > current_date then
    raise exception 'ACQUISITION_RESPONSE_IN_FUTURE' using errcode = '22023';
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_partner_profile()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if not exists (select 1 from public.organizations o where o.id = new.organization_id) then
    raise exception 'PARTNER_ORGANIZATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Der aktive Teil der Sperre: eine regulierte Berufsgruppe kommt nicht in ein
  -- Verguetungsmodell, auch nicht durch spaeteres Umstellen des Kennzeichens.
  if new.regulated_profession <> 'NONE' and new.compliance_status = 'COMMISSION_POSSIBLE' then
    raise exception 'PARTNER_REGULATED_NO_COMMISSION' using errcode = '22023';
  end if;
  if new.compliance_reviewed_on is not null and new.compliance_reviewed_on > current_date then
    raise exception 'PARTNER_REVIEW_IN_FUTURE' using errcode = '22023';
  end if;
  if new.last_order_on is not null and new.last_order_on > current_date then
    raise exception 'PARTNER_LAST_ORDER_IN_FUTURE' using errcode = '22023';
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_partner_referral_fee()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_profile public.partner_profiles%rowtype;
begin
  select * into v_profile from public.partner_profiles where organization_id = new.organization_id;
  if v_profile.id is null then
    raise exception 'FEE_PARTNER_PROFILE_MISSING' using errcode = '22023';
  end if;
  if v_profile.regulated_profession <> 'NONE' then
    raise exception 'FEE_PARTNER_REGULATED' using errcode = '22023';
  end if;
  if v_profile.compliance_status <> 'COMMISSION_POSSIBLE' then
    raise exception 'FEE_PARTNER_NOT_CLEARED' using errcode = '22023';
  end if;
  if v_profile.blocked then
    raise exception 'FEE_PARTNER_BLOCKED' using errcode = '22023';
  end if;
  if new.agreed_on > current_date then
    raise exception 'FEE_AGREED_IN_FUTURE' using errcode = '22023';
  end if;
  return new;
end;
$function$;

-- Wird das Profil nachtraeglich auf eine regulierte Berufsgruppe umgestellt oder
-- die Verguetung zurueckgenommen, muessen bestehende Zusagen sichtbar werden,
-- statt still weiterzulaufen.
create or replace function app_private.guard_partner_profile_downgrade()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_open integer;
begin
  if new.compliance_status = 'COMMISSION_POSSIBLE' and new.regulated_profession = 'NONE' then
    return new;
  end if;
  select count(*) into v_open
  from public.partner_referral_fees f
  where f.organization_id = new.organization_id and f.status in ('AGREED','INVOICED');
  if v_open > 0 then
    raise exception 'PARTNER_HAS_OPEN_FEES' using errcode = '22023',
      detail = 'Zu diesem Partner sind ' || v_open || ' offene Vergütungszusagen erfasst. Sie sind zuerst zu klären.';
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.acquisition_areas enable row level security;
alter table public.acquisition_campaigns enable row level security;
alter table public.acquisition_waves enable row level security;
alter table public.lead_acquisitions enable row level security;
alter table public.partner_profiles enable row level security;
alter table public.partner_referral_fees enable row level security;

drop policy if exists acquisition_areas_select on public.acquisition_areas;
create policy acquisition_areas_select on public.acquisition_areas for select to authenticated
using ((select app_private.has_permission('acquisition.read')));
drop policy if exists acquisition_areas_insert on public.acquisition_areas;
create policy acquisition_areas_insert on public.acquisition_areas for insert to authenticated
with check ((select app_private.has_permission('acquisition.write')) and created_by = (select auth.uid()));
drop policy if exists acquisition_areas_update on public.acquisition_areas;
create policy acquisition_areas_update on public.acquisition_areas for update to authenticated
using ((select app_private.has_permission('acquisition.write')))
with check ((select app_private.has_permission('acquisition.write')));

drop policy if exists acquisition_campaigns_select on public.acquisition_campaigns;
create policy acquisition_campaigns_select on public.acquisition_campaigns for select to authenticated
using ((select app_private.has_permission('acquisition.read')));
drop policy if exists acquisition_campaigns_insert on public.acquisition_campaigns;
create policy acquisition_campaigns_insert on public.acquisition_campaigns for insert to authenticated
with check ((select app_private.has_permission('acquisition.write')) and created_by = (select auth.uid()));
drop policy if exists acquisition_campaigns_update on public.acquisition_campaigns;
create policy acquisition_campaigns_update on public.acquisition_campaigns for update to authenticated
using ((select app_private.has_permission('acquisition.write')))
with check ((select app_private.has_permission('acquisition.write')));

drop policy if exists acquisition_waves_select on public.acquisition_waves;
create policy acquisition_waves_select on public.acquisition_waves for select to authenticated
using ((select app_private.has_permission('acquisition.read')));
drop policy if exists acquisition_waves_write on public.acquisition_waves;
create policy acquisition_waves_write on public.acquisition_waves for all to authenticated
using ((select app_private.has_permission('acquisition.write')))
with check ((select app_private.has_permission('acquisition.write')));

drop policy if exists lead_acquisitions_select on public.lead_acquisitions;
create policy lead_acquisitions_select on public.lead_acquisitions for select to authenticated
using ((select app_private.has_permission('lead.read')));
drop policy if exists lead_acquisitions_insert on public.lead_acquisitions;
create policy lead_acquisitions_insert on public.lead_acquisitions for insert to authenticated
with check ((select app_private.has_permission('lead.write')) and created_by = (select auth.uid()));
drop policy if exists lead_acquisitions_update on public.lead_acquisitions;
create policy lead_acquisitions_update on public.lead_acquisitions for update to authenticated
using ((select app_private.has_permission('lead.write')))
with check ((select app_private.has_permission('lead.write')));

drop policy if exists partner_profiles_select on public.partner_profiles;
create policy partner_profiles_select on public.partner_profiles for select to authenticated
using ((select app_private.has_permission('organization.read')));
drop policy if exists partner_profiles_insert on public.partner_profiles;
create policy partner_profiles_insert on public.partner_profiles for insert to authenticated
with check ((select app_private.has_permission('organization.write')) and created_by = (select auth.uid()));
drop policy if exists partner_profiles_update on public.partner_profiles;
create policy partner_profiles_update on public.partner_profiles for update to authenticated
using ((select app_private.has_permission('organization.write')))
with check ((select app_private.has_permission('organization.write')));

drop policy if exists partner_referral_fees_select on public.partner_referral_fees;
create policy partner_referral_fees_select on public.partner_referral_fees for select to authenticated
using ((select app_private.has_permission('organization.read')));
drop policy if exists partner_referral_fees_write on public.partner_referral_fees;
create policy partner_referral_fees_write on public.partner_referral_fees for all to authenticated
using ((select app_private.has_permission('organization.write')))
with check ((select app_private.has_permission('organization.write')));

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
drop trigger if exists acquisition_areas_10_validate on public.acquisition_areas;
create trigger acquisition_areas_10_validate before insert or update on public.acquisition_areas
for each row execute function app_private.validate_acquisition_area();
drop trigger if exists acquisition_areas_20_archive_guard on public.acquisition_areas;
create trigger acquisition_areas_20_archive_guard before update on public.acquisition_areas
for each row execute function app_private.enforce_archive_permission('acquisition.archive');
drop trigger if exists acquisition_areas_40_metadata on public.acquisition_areas;
create trigger acquisition_areas_40_metadata before update on public.acquisition_areas
for each row execute function app_private.set_business_update_metadata();
drop trigger if exists acquisition_areas_90_audit on public.acquisition_areas;
create trigger acquisition_areas_90_audit after insert or update or delete on public.acquisition_areas
for each row execute function app_private.audit_row_change('ACQUISITION_AREA','name');

drop trigger if exists acquisition_campaigns_10_validate on public.acquisition_campaigns;
create trigger acquisition_campaigns_10_validate before insert or update on public.acquisition_campaigns
for each row execute function app_private.validate_acquisition_campaign();
drop trigger if exists acquisition_campaigns_20_archive_guard on public.acquisition_campaigns;
create trigger acquisition_campaigns_20_archive_guard before update on public.acquisition_campaigns
for each row execute function app_private.enforce_archive_permission('acquisition.archive');
drop trigger if exists acquisition_campaigns_40_metadata on public.acquisition_campaigns;
create trigger acquisition_campaigns_40_metadata before update on public.acquisition_campaigns
for each row execute function app_private.set_business_update_metadata();
drop trigger if exists acquisition_campaigns_90_audit on public.acquisition_campaigns;
create trigger acquisition_campaigns_90_audit after insert or update or delete on public.acquisition_campaigns
for each row execute function app_private.audit_row_change('CAMPAIGN','campaign_number');

drop trigger if exists acquisition_waves_10_validate on public.acquisition_waves;
create trigger acquisition_waves_10_validate before insert or update on public.acquisition_waves
for each row execute function app_private.validate_acquisition_wave();
drop trigger if exists acquisition_waves_40_metadata on public.acquisition_waves;
create trigger acquisition_waves_40_metadata before update on public.acquisition_waves
for each row execute function app_private.set_standard_update_metadata();
drop trigger if exists acquisition_waves_90_audit on public.acquisition_waves;
create trigger acquisition_waves_90_audit after insert or update or delete on public.acquisition_waves
for each row execute function app_private.audit_row_change('CAMPAIGN_WAVE','name');

drop trigger if exists lead_acquisitions_10_validate on public.lead_acquisitions;
create trigger lead_acquisitions_10_validate before insert or update on public.lead_acquisitions
for each row execute function app_private.validate_lead_acquisition();
drop trigger if exists lead_acquisitions_40_metadata on public.lead_acquisitions;
create trigger lead_acquisitions_40_metadata before update on public.lead_acquisitions
for each row execute function app_private.set_standard_update_metadata();
drop trigger if exists lead_acquisitions_90_audit on public.lead_acquisitions;
create trigger lead_acquisitions_90_audit after insert or update or delete on public.lead_acquisitions
for each row execute function app_private.audit_row_change('LEAD_ACQUISITION','response_channel');

drop trigger if exists partner_profiles_10_validate on public.partner_profiles;
create trigger partner_profiles_10_validate before insert or update on public.partner_profiles
for each row execute function app_private.validate_partner_profile();
drop trigger if exists partner_profiles_15_downgrade_guard on public.partner_profiles;
create trigger partner_profiles_15_downgrade_guard before update on public.partner_profiles
for each row execute function app_private.guard_partner_profile_downgrade();
drop trigger if exists partner_profiles_40_metadata on public.partner_profiles;
create trigger partner_profiles_40_metadata before update on public.partner_profiles
for each row execute function app_private.set_standard_update_metadata();
drop trigger if exists partner_profiles_90_audit on public.partner_profiles;
create trigger partner_profiles_90_audit after insert or update or delete on public.partner_profiles
for each row execute function app_private.audit_row_change('PARTNER_PROFILE','trade');

drop trigger if exists partner_referral_fees_10_validate on public.partner_referral_fees;
create trigger partner_referral_fees_10_validate before insert or update on public.partner_referral_fees
for each row execute function app_private.validate_partner_referral_fee();
drop trigger if exists partner_referral_fees_40_metadata on public.partner_referral_fees;
create trigger partner_referral_fees_40_metadata before update on public.partner_referral_fees
for each row execute function app_private.set_standard_update_metadata();
drop trigger if exists partner_referral_fees_90_audit on public.partner_referral_fees;
create trigger partner_referral_fees_90_audit after insert or update or delete on public.partner_referral_fees
for each row execute function app_private.audit_row_change('PARTNER_REFERRAL_FEE','basis');

grant select, insert, update on public.acquisition_areas to authenticated;
grant select, insert, update on public.acquisition_campaigns to authenticated;
grant select, insert, update, delete on public.acquisition_waves to authenticated;
grant select, insert, update on public.lead_acquisitions to authenticated;
grant select, insert, update on public.partner_profiles to authenticated;
grant select, insert, update, delete on public.partner_referral_fees to authenticated;
grant usage, select on sequence public.acquisition_campaign_number_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Auswertung
-- ---------------------------------------------------------------------------
create or replace function public.acquisition_area_path(p_area_id uuid)
returns text
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
  with recursive up as (
    select a.id, a.parent_area_id, a.name, 1 as depth
    from public.acquisition_areas a where a.id = p_area_id
    union all
    select a.id, a.parent_area_id, a.name, up.depth + 1
    from public.acquisition_areas a join up on a.id = up.parent_area_id
    where up.depth < 8
  )
  select string_agg(name, ' › ' order by depth desc) from up;
$function$;

create or replace function public.acquisition_campaign_performance(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
  with attributed as (
    select la.campaign_id, l.id as lead_id, l.contact_id, l.converted_property_id,
           l.valuation_appointment_at
    from public.lead_acquisitions la
    join public.leads l on l.id = la.lead_id
    where la.campaign_id is not null
      and l.archived_at is null
      and l.created_at >= p_from::timestamp at time zone 'Europe/Berlin'
      and l.created_at < (p_to + 1)::timestamp at time zone 'Europe/Berlin'
  )
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.campaign_number), '[]'::jsonb)
  from (
    select
      c.id as campaign_id,
      c.campaign_number,
      c.name,
      c.status,
      public.acquisition_area_path(c.area_id) as area_path,
      s.label as channel_label,
      c.starts_on, c.ends_on,
      c.household_count,
      c.planned_cost, c.actual_cost,
      (select count(*) from attributed a where a.campaign_id = c.id) as responses,
      (select count(distinct a.contact_id) from attributed a where a.campaign_id = c.id and a.contact_id is not null) as contacts,
      (select count(*) from attributed a where a.campaign_id = c.id and a.valuation_appointment_at is not null) as owner_talks,
      (select count(*) from public.lead_sales_readiness_checks k
        where k.lead_id in (select a.lead_id from attributed a where a.campaign_id = c.id)) as readiness_checks,
      (select count(*) from public.brokerage_mandates m
        where m.archived_at is null
          and m.property_id in (select a.converted_property_id from attributed a where a.campaign_id = c.id and a.converted_property_id is not null)) as mandates,
      (select count(*) from public.sale_closings sc
        where sc.archived_at is null and sc.status <> 'CANCELLED' and sc.notarized_date is not null
          and sc.property_id in (select a.converted_property_id from attributed a where a.campaign_id = c.id and a.converted_property_id is not null)) as sales,
      (select coalesce(sum(cm.expected_amount),0) from public.commissions cm
        where cm.archived_at is null
          and cm.property_id in (select a.converted_property_id from attributed a where a.campaign_id = c.id and a.converted_property_id is not null)) as commission_expected,
      (select coalesce(sum(cm.paid_amount),0) from public.commissions cm
        where cm.archived_at is null
          and cm.property_id in (select a.converted_property_id from attributed a where a.campaign_id = c.id and a.converted_property_id is not null)) as commission_paid
    from public.acquisition_campaigns c
    join public.lead_sources s on s.id = c.source_id
    where c.archived_at is null
  ) x;
$function$;

comment on function public.acquisition_campaign_performance(date,date) is 'Kennzahlen je Kampagne aus den zugeordneten Leads. Provisionswerte sind nur sichtbar, wenn der Benutzer Provisionen lesen darf.';

create or replace function public.partner_referral_performance(p_from date, p_to date)
returns jsonb
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
  with attributed as (
    select la.referrer_organization_id, l.id as lead_id, l.converted_property_id, l.valuation_appointment_at
    from public.lead_acquisitions la
    join public.leads l on l.id = la.lead_id
    where la.referrer_organization_id is not null
      and l.archived_at is null
      and l.created_at >= p_from::timestamp at time zone 'Europe/Berlin'
      and l.created_at < (p_to + 1)::timestamp at time zone 'Europe/Berlin'
  )
  select coalesce(jsonb_agg(row_to_json(x)::jsonb order by x.referrals desc, x.name), '[]'::jsonb)
  from (
    select
      o.id as organization_id,
      o.organization_number,
      o.name,
      pp.trade,
      pp.compliance_status,
      pp.regulated_profession,
      pp.blocked,
      (select count(*) from attributed a where a.referrer_organization_id = o.id) as referrals,
      (select count(*) from attributed a where a.referrer_organization_id = o.id and a.valuation_appointment_at is not null) as appointments,
      (select count(*) from public.lead_sales_readiness_checks k
        where k.lead_id in (select a.lead_id from attributed a where a.referrer_organization_id = o.id)) as readiness_checks,
      (select count(*) from public.brokerage_mandates m
        where m.archived_at is null
          and m.property_id in (select a.converted_property_id from attributed a where a.referrer_organization_id = o.id and a.converted_property_id is not null)) as mandates,
      (select count(*) from public.sale_closings sc
        where sc.archived_at is null and sc.status <> 'CANCELLED' and sc.notarized_date is not null
          and sc.property_id in (select a.converted_property_id from attributed a where a.referrer_organization_id = o.id and a.converted_property_id is not null)) as sales,
      (select coalesce(sum(f.amount),0) from public.partner_referral_fees f
        where f.organization_id = o.id and f.status <> 'CANCELLED') as referral_fees
    from public.organizations o
    left join public.partner_profiles pp on pp.organization_id = o.id
    where o.archived_at is null
      and exists (select 1 from attributed a where a.referrer_organization_id = o.id)
  ) x;
$function$;

comment on function public.partner_referral_performance(date,date) is 'Kennzahlen je empfehlendem Partner. Zeigt nur Partner, denen im Zeitraum mindestens ein Lead zugeordnet ist.';

revoke all on function public.acquisition_area_path(uuid) from public;
revoke execute on function public.acquisition_area_path(uuid) from anon;
grant execute on function public.acquisition_area_path(uuid) to authenticated;

revoke all on function public.acquisition_campaign_performance(date,date) from public;
revoke execute on function public.acquisition_campaign_performance(date,date) from anon;
grant execute on function public.acquisition_campaign_performance(date,date) to authenticated;

revoke all on function public.partner_referral_performance(date,date) from public;
revoke execute on function public.partner_referral_performance(date,date) from anon;
grant execute on function public.partner_referral_performance(date,date) to authenticated;
