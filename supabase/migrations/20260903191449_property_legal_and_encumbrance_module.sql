-- Thema 4 (Maklerpraxis): Grundbuch, Lasten und oeffentlich-rechtliche Beschraenkungen.
-- Die Immobilie wird zusaetzlich als Rechtsobjekt abgebildet. Das System erfasst
-- Sachverhalte und macht sie sichtbar; es bewertet sie nicht rechtlich und
-- veroeffentlicht keine dieser Angaben.

-- 1:1-Rechtsakte je Immobilie, analog zu property_energy_data.
create table if not exists public.property_legal_data (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique constraint property_legal_data_property_id_fkey references public.properties(id) on delete cascade,

  land_registry_court text,
  land_register_sheet text,
  cadastral_district text,
  parcel_section text,
  parcel_number text,
  registered_area_sqm numeric(12,2) check (registered_area_sqm is null or registered_area_sqm > 0),
  co_ownership_share text,
  extract_dated_on date,

  living_area_basis text not null default 'UNKNOWN'
    check (living_area_basis in ('WOFLV','DIN_277','ESTIMATED','UNKNOWN')),

  heritable_building_right boolean not null default false,
  ground_rent_amount numeric(12,2) check (ground_rent_amount is null or ground_rent_amount >= 0),
  ground_rent_interval text check (ground_rent_interval is null or ground_rent_interval in ('ANNUAL','QUARTERLY','MONTHLY')),
  ground_lease_until date,
  ground_lessor_contact_id uuid constraint property_legal_data_ground_lessor_contact_id_fkey references public.contacts(id),
  ground_lessor_name text,

  monument_protection boolean not null default false,
  monument_protection_note text,
  milieu_protection boolean not null default false,
  milieu_protection_note text,
  redevelopment_area boolean not null default false,
  redevelopment_area_note text,
  contamination_suspicion boolean not null default false,
  contamination_suspicion_note text,
  development_charges_open boolean not null default false,
  development_charges_note text,

  legal_notes text,
  reviewed_on date,
  reviewed_by uuid constraint property_legal_data_reviewed_by_fkey references public.profiles(user_id),

  created_at timestamptz not null default now(),
  created_by uuid constraint property_legal_data_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint property_legal_data_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),

  constraint property_legal_data_extract_date_check check (extract_dated_on is null or extract_dated_on <= current_date),
  constraint property_legal_data_reviewed_date_check check (reviewed_on is null or reviewed_on <= current_date),
  constraint property_legal_data_heritable_check check (
    heritable_building_right
    or (ground_rent_amount is null and ground_rent_interval is null and ground_lease_until is null
        and ground_lessor_contact_id is null and coalesce(btrim(ground_lessor_name),'') = '')
  ),
  constraint property_legal_data_ground_rent_pair_check check (ground_rent_amount is null or ground_rent_interval is not null)
);

comment on table public.property_legal_data is 'Grundbuchbezug, Erbbaurecht, Wohnflaechengrundlage und oeffentlich-rechtliche Merkmale je Immobilie. Reine Erfassung, keine rechtliche Bewertung, keine Veroeffentlichung.';
comment on column public.property_legal_data.living_area_basis is 'Grundlage der ausgewiesenen Wohnflaeche: WoFlV, DIN 277, geschaetzt oder unbekannt.';
comment on column public.property_legal_data.registered_area_sqm is 'Grundstuecksgroesse laut Grundbuch bzw. Liegenschaftskataster, unabhaengig von plot_area_sqm der Vermarktungsdaten.';

create index if not exists property_legal_data_ground_lessor_idx on public.property_legal_data(ground_lessor_contact_id);
create index if not exists property_legal_data_reviewed_by_idx on public.property_legal_data(reviewed_by);
create index if not exists property_legal_data_created_by_idx on public.property_legal_data(created_by);
create index if not exists property_legal_data_updated_by_idx on public.property_legal_data(updated_by);

-- Belastungen und Beschraenkungen: mehrfach je Immobilie, deshalb eigene Relation.
create table if not exists public.property_encumbrances (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null constraint property_encumbrances_property_id_fkey references public.properties(id) on delete cascade,
  section text not null check (section in ('LAND_REGISTER_II','LAND_REGISTER_III','BUILDING_ENCUMBRANCE')),
  kind text not null,
  rank_position integer check (rank_position is null or rank_position > 0),
  beneficiary_contact_id uuid constraint property_encumbrances_beneficiary_contact_id_fkey references public.contacts(id),
  beneficiary_name text,
  authority text,
  reference text,
  content text not null check (coalesce(btrim(content),'') <> ''),
  nominal_amount numeric(14,2) check (nominal_amount is null or nominal_amount >= 0),
  remaining_amount numeric(14,2) check (remaining_amount is null or remaining_amount >= 0),
  deletable text not null default 'UNCLEAR' check (deletable in ('YES','NO','UNCLEAR')),
  deletion_consent_available boolean not null default false,
  sale_impact text not null default 'UNCLEAR'
    check (sale_impact in ('NONE','TRANSFERS_TO_BUYER','MUST_BE_DELETED','PURCHASE_PRICE_RELEVANT','UNCLEAR')),
  registered_on date,
  deleted_on date,
  notes text,

  created_at timestamptz not null default now(),
  created_by uuid constraint property_encumbrances_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint property_encumbrances_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  archived_at timestamptz,
  archived_by uuid constraint property_encumbrances_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),

  constraint property_encumbrances_section_kind_check check (
    (section = 'LAND_REGISTER_II' and kind in ('RESIDENCE_RIGHT','USUFRUCT','RIGHT_OF_WAY','UTILITY_EASEMENT','PRE_EMPTION_RIGHT','REAL_CHARGE','HERITABLE_BUILDING_RIGHT','PRIORITY_NOTICE','REDEVELOPMENT_NOTE','REALLOCATION_NOTE','INSOLVENCY_NOTE','OTHER'))
    or (section = 'LAND_REGISTER_III' and kind in ('LAND_CHARGE','MORTGAGE','ANNUITY_CHARGE','OTHER'))
    or (section = 'BUILDING_ENCUMBRANCE' and kind in ('ACCESS','DISTANCE_AREA','PARKING','UNION','DEVELOPMENT','CHILDREN_PLAYGROUND','OTHER'))
  ),
  constraint property_encumbrances_amount_section_check check (
    section = 'LAND_REGISTER_III' or (nominal_amount is null and remaining_amount is null)
  ),
  constraint property_encumbrances_nominal_required_check check (
    section <> 'LAND_REGISTER_III' or nominal_amount is not null
  ),
  constraint property_encumbrances_remaining_le_nominal_check check (
    remaining_amount is null or nominal_amount is null or remaining_amount <= nominal_amount
  ),
  constraint property_encumbrances_dates_check check (
    deleted_on is null or registered_on is null or deleted_on >= registered_on
  ),
  constraint property_encumbrances_party_check check (
    coalesce(btrim(beneficiary_name),'') <> '' or beneficiary_contact_id is not null or coalesce(btrim(authority),'') <> ''
  )
);

comment on table public.property_encumbrances is 'Eintraege der Grundbuchabteilungen II und III sowie Baulasten je Immobilie. Das System dokumentiert Bestand, Rang und Auswirkung auf den Verkauf; es bewertet nicht rechtlich und veroeffentlicht nichts davon.';
comment on column public.property_encumbrances.sale_impact is 'Vom Bearbeiter erfasste Einschaetzung der Auswirkung auf den Verkauf. Keine Rechtsauskunft.';

create index if not exists property_encumbrances_property_idx on public.property_encumbrances(property_id);
create index if not exists property_encumbrances_open_idx on public.property_encumbrances(property_id, section) where archived_at is null and deleted_on is null;
create index if not exists property_encumbrances_beneficiary_idx on public.property_encumbrances(beneficiary_contact_id);
create index if not exists property_encumbrances_created_by_idx on public.property_encumbrances(created_by);
create index if not exists property_encumbrances_updated_by_idx on public.property_encumbrances(updated_by);
create index if not exists property_encumbrances_archived_by_idx on public.property_encumbrances(archived_by);

create or replace function app_private.validate_property_legal_data()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if not exists (select 1 from public.properties p where p.id = new.property_id) then
    raise exception 'LEGAL_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.heritable_building_right and new.ground_lease_until is not null and new.ground_lease_until <= current_date then
    raise exception 'LEGAL_GROUND_LEASE_EXPIRED' using errcode = '22023';
  end if;
  if new.ground_lessor_contact_id is not null
     and not exists (select 1 from public.contacts c where c.id = new.ground_lessor_contact_id) then
    raise exception 'LEGAL_GROUND_LESSOR_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.reviewed_on is not null and new.reviewed_by is null then
    raise exception 'LEGAL_REVIEWER_REQUIRED' using errcode = '22023';
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_property_encumbrance()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if not exists (select 1 from public.properties p where p.id = new.property_id) then
    raise exception 'ENCUMBRANCE_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.beneficiary_contact_id is not null
     and not exists (select 1 from public.contacts c where c.id = new.beneficiary_contact_id) then
    raise exception 'ENCUMBRANCE_BENEFICIARY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.registered_on is not null and new.registered_on > current_date then
    raise exception 'ENCUMBRANCE_REGISTERED_IN_FUTURE' using errcode = '22023';
  end if;
  if new.deleted_on is not null and new.deleted_on > current_date then
    raise exception 'ENCUMBRANCE_DELETED_IN_FUTURE' using errcode = '22023';
  end if;
  if new.deleted_on is not null and new.deletable = 'NO' then
    raise exception 'ENCUMBRANCE_DELETED_BUT_NOT_DELETABLE' using errcode = '22023';
  end if;
  if new.deletion_consent_available and new.section <> 'LAND_REGISTER_III' then
    raise exception 'ENCUMBRANCE_DELETION_CONSENT_ONLY_SECTION_III' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and old.archived_at is not null and new.archived_at is not null
     and row(new.section,new.kind,new.content,new.nominal_amount,new.remaining_amount,new.deletable,new.sale_impact)
         is distinct from
         row(old.section,old.kind,old.content,old.nominal_amount,old.remaining_amount,old.deletable,old.sale_impact) then
    raise exception 'ARCHIVED_ENCUMBRANCE_IMMUTABLE' using errcode = '22023';
  end if;
  return new;
end;
$function$;

-- Hinweis fuer die Vermarktungsreife: bewusst nicht erforderlich, also kein hartes Blockieren.
create or replace function app_private.seed_property_checklist()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  perform set_config('app.seed_property_checklist','1',true);
  insert into public.property_marketing_checklist_items(property_id,item_key,title,category,required,created_by,updated_by) values
  (new.id,'OWNER_DATA','Eigentümerdaten vollständig','OWNER',true,new.created_by,new.created_by),
  (new.id,'BROKERAGE_AGREEMENT','Maklervertrag vorhanden','CONTRACT',true,new.created_by,new.created_by),
  (new.id,'PROPERTY_DATA','Objektstammdaten vollständig','PROPERTY',true,new.created_by,new.created_by),
  (new.id,'ADDRESS','Objektadresse geprüft','PROPERTY',true,new.created_by,new.created_by),
  (new.id,'LEGAL_STATUS','Grundbuch und Lasten geprüft','PROPERTY',false,new.created_by,new.created_by),
  (new.id,'ENERGY','Energiedaten geprüft','ENERGY',true,new.created_by,new.created_by),
  (new.id,'FLOOR_PLANS','Grundrisse geprüft','DOCUMENTS',false,new.created_by,new.created_by),
  (new.id,'PHOTOS','Objektfotos vorbereitet','MEDIA',true,new.created_by,new.created_by),
  (new.id,'PRICE_APPROVAL','Preis/Freigabe dokumentiert','MARKETING',true,new.created_by,new.created_by),
  (new.id,'DESCRIPTION','Vermarktungstext geprüft','MARKETING',true,new.created_by,new.created_by),
  (new.id,'PUBLICATION_APPROVAL','Veröffentlichungsfreigabe','MARKETING',true,new.created_by,new.created_by)
  on conflict do nothing;
  perform set_config('app.seed_property_checklist','0',true);
  return new;
end;
$$;

insert into public.property_marketing_checklist_items(property_id,item_key,title,category,required,created_by,updated_by)
select p.id,'LEGAL_STATUS','Grundbuch und Lasten geprüft','PROPERTY',false,p.created_by,p.created_by
from public.properties p
where not exists (
  select 1 from public.property_marketing_checklist_items i
  where i.property_id = p.id and i.item_key = 'LEGAL_STATUS'
);

alter table public.property_legal_data enable row level security;
alter table public.property_encumbrances enable row level security;

drop policy if exists property_legal_data_select on public.property_legal_data;
create policy property_legal_data_select on public.property_legal_data for select to authenticated
using ((select app_private.has_permission('property.read')));

drop policy if exists property_legal_data_insert on public.property_legal_data;
create policy property_legal_data_insert on public.property_legal_data for insert to authenticated
with check ((select app_private.has_permission('property.write')) and created_by = (select auth.uid()));

drop policy if exists property_legal_data_update on public.property_legal_data;
create policy property_legal_data_update on public.property_legal_data for update to authenticated
using ((select app_private.has_permission('property.write')))
with check ((select app_private.has_permission('property.write')));

drop policy if exists property_encumbrances_select on public.property_encumbrances;
create policy property_encumbrances_select on public.property_encumbrances for select to authenticated
using ((select app_private.has_permission('property.read')));

drop policy if exists property_encumbrances_insert on public.property_encumbrances;
create policy property_encumbrances_insert on public.property_encumbrances for insert to authenticated
with check ((select app_private.has_permission('property.write')) and created_by = (select auth.uid()));

drop policy if exists property_encumbrances_update on public.property_encumbrances;
create policy property_encumbrances_update on public.property_encumbrances for update to authenticated
using ((select app_private.has_permission('property.write')))
with check ((select app_private.has_permission('property.write')));

drop policy if exists property_encumbrances_delete on public.property_encumbrances;
create policy property_encumbrances_delete on public.property_encumbrances for delete to authenticated
using ((select app_private.has_permission('property.write')));

drop trigger if exists property_legal_data_10_validate on public.property_legal_data;
create trigger property_legal_data_10_validate before insert or update on public.property_legal_data
for each row execute function app_private.validate_property_legal_data();

drop trigger if exists property_legal_data_40_metadata on public.property_legal_data;
create trigger property_legal_data_40_metadata before update on public.property_legal_data
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists property_legal_data_90_audit on public.property_legal_data;
create trigger property_legal_data_90_audit after insert or update or delete on public.property_legal_data
for each row execute function app_private.audit_property_child('LEGAL_DATA');

drop trigger if exists property_encumbrances_10_validate on public.property_encumbrances;
create trigger property_encumbrances_10_validate before insert or update on public.property_encumbrances
for each row execute function app_private.validate_property_encumbrance();

drop trigger if exists property_encumbrances_20_archive_guard on public.property_encumbrances;
create trigger property_encumbrances_20_archive_guard before update on public.property_encumbrances
for each row execute function app_private.enforce_archive_permission('property.archive');

drop trigger if exists property_encumbrances_40_metadata on public.property_encumbrances;
create trigger property_encumbrances_40_metadata before update on public.property_encumbrances
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists property_encumbrances_90_audit on public.property_encumbrances;
create trigger property_encumbrances_90_audit after insert or update or delete on public.property_encumbrances
for each row execute function app_private.audit_property_child('ENCUMBRANCE');

grant select, insert, update on public.property_legal_data to authenticated;
grant select, insert, update, delete on public.property_encumbrances to authenticated;
