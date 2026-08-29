create table if not exists app_private.property_number_counters (
  year integer primary key,
  last_value integer not null check (last_value > 0)
);

create or replace function app_private.next_property_number()
returns text
language plpgsql
security definer
set search_path = app_private, public, pg_temp
as $$
declare
  v_year integer := extract(year from current_date)::integer;
  v_value integer;
begin
  insert into app_private.property_number_counters(year, last_value)
  values (v_year, 1)
  on conflict (year) do update set last_value = app_private.property_number_counters.last_value + 1
  returning last_value into v_value;
  return 'ZM-' || v_year::text || '-' || lpad(v_value::text, 4, '0');
end;
$$;
revoke all on function app_private.next_property_number() from public;

create or replace function app_private.set_standard_update_metadata()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  new.version := old.version + 1;
  return new;
end;
$$;
revoke all on function app_private.set_standard_update_metadata() from public;

create table public.property_status_transitions (
  from_status text not null,
  to_status text not null,
  description text,
  primary key (from_status, to_status)
);

insert into public.property_status_transitions(from_status,to_status,description) values
('DRAFT','ACQUISITION','Akquise starten'),('DRAFT','WITHDRAWN','Entwurf zurückziehen'),('DRAFT','ARCHIVED','Entwurf archivieren'),
('ACQUISITION','DRAFT','Zurück zum Entwurf'),('ACQUISITION','VALUATION','Bewertung starten'),('ACQUISITION','LOST','Akquise verloren'),('ACQUISITION','WITHDRAWN','Vom Eigentümer zurückgezogen'),('ACQUISITION','ARCHIVED','Akquise archivieren'),
('VALUATION','ACQUISITION','Zurück zur Akquise'),('VALUATION','CONTRACT_PENDING','Maklervertrag vorbereiten'),('VALUATION','LOST','Bewertung ohne Auftrag beendet'),('VALUATION','WITHDRAWN','Zurückgezogen'),('VALUATION','ARCHIVED','Bewertung archivieren'),
('CONTRACT_PENDING','VALUATION','Zurück zur Bewertung'),('CONTRACT_PENDING','PREPARATION','Auftrag gewonnen / Vorbereitung'),('CONTRACT_PENDING','LOST','Auftrag verloren'),('CONTRACT_PENDING','WITHDRAWN','Zurückgezogen'),('CONTRACT_PENDING','ARCHIVED','Vorgang archivieren'),
('PREPARATION','CONTRACT_PENDING','Zurück zum Vertragsstatus'),('PREPARATION','MARKETING','Vermarktung starten'),('PREPARATION','LOST','Objekt verloren'),('PREPARATION','WITHDRAWN','Zurückgezogen'),('PREPARATION','ARCHIVED','Objekt archivieren'),
('MARKETING','PREPARATION','Zurück in Vorbereitung'),('MARKETING','RESERVED','Reservieren'),('MARKETING','NOTARY','Direkt zum Notarprozess'),('MARKETING','LOST','Objekt verloren'),('MARKETING','WITHDRAWN','Zurückgezogen'),('MARKETING','ARCHIVED','Vermarktung archivieren'),
('RESERVED','MARKETING','Reservierung aufheben'),('RESERVED','NOTARY','Notarprozess starten'),('RESERVED','LOST','Reservierung verloren'),('RESERVED','WITHDRAWN','Zurückgezogen'),('RESERVED','ARCHIVED','Reservierung archivieren'),
('NOTARY','RESERVED','Zurück zur Reservierung'),('NOTARY','MARKETING','Zurück in Vermarktung'),('NOTARY','SOLD','Verkauft'),('NOTARY','LOST','Notarprozess gescheitert'),('NOTARY','WITHDRAWN','Zurückgezogen'),('NOTARY','ARCHIVED','Vorgang archivieren'),
('SOLD','ARCHIVED','Verkauftes Objekt archivieren'),
('LOST','ACQUISITION','Akquise wieder öffnen'),('LOST','ARCHIVED','Verlorenes Objekt archivieren'),
('WITHDRAWN','ACQUISITION','Vorgang wieder öffnen'),('WITHDRAWN','ARCHIVED','Zurückgezogenes Objekt archivieren')
on conflict do nothing;

create table public.properties (
  id uuid primary key default gen_random_uuid(),
  property_number text not null unique default app_private.next_property_number(),
  internal_title text not null check (length(trim(internal_title)) > 0),
  property_type text not null check (property_type in ('DETACHED_HOUSE','SEMI_DETACHED_HOUSE','TERRACED_HOUSE','APARTMENT_BUILDING','APARTMENT','PENTHOUSE','MAISONETTE','LAND','COMMERCIAL','OFFICE','RETAIL','GARAGE','PARKING_SPACE','OTHER')),
  transaction_type text not null check (transaction_type in ('SALE','RENT')),
  status text not null default 'DRAFT' check (status in ('DRAFT','ACQUISITION','VALUATION','CONTRACT_PENDING','PREPARATION','MARKETING','RESERVED','NOTARY','SOLD','LOST','WITHDRAWN','ARCHIVED')),
  status_before_archive text,
  purchase_price numeric(14,2) check (purchase_price is null or purchase_price >= 0),
  rent_cold numeric(14,2) check (rent_cold is null or rent_cold >= 0),
  additional_costs numeric(14,2) check (additional_costs is null or additional_costs >= 0),
  hoa_fee numeric(14,2) check (hoa_fee is null or hoa_fee >= 0),
  living_area_sqm numeric(12,2) check (living_area_sqm is null or living_area_sqm >= 0),
  usable_area_sqm numeric(12,2) check (usable_area_sqm is null or usable_area_sqm >= 0),
  plot_area_sqm numeric(12,2) check (plot_area_sqm is null or plot_area_sqm >= 0),
  rooms numeric(5,1) check (rooms is null or rooms >= 0),
  bedrooms integer check (bedrooms is null or bedrooms >= 0),
  bathrooms integer check (bathrooms is null or bathrooms >= 0),
  floor integer,
  year_built integer check (year_built is null or year_built between 1000 and 2200),
  modernization_year integer check (modernization_year is null or modernization_year between 1000 and 2200),
  condition text,
  available_from date,
  tenancy_status text check (tenancy_status is null or tenancy_status in ('VACANT','OWNER_OCCUPIED','RENTED','PARTIALLY_RENTED','UNKNOWN')),
  parking_spaces integer check (parking_spaces is null or parking_spaces >= 0),
  residential_units integer check (residential_units is null or residential_units >= 0),
  internal_notes text,
  primary_responsible_user uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  archived_at timestamptz,
  archived_by uuid references auth.users(id) on delete set null,
  version bigint not null default 1 check (version > 0),
  check ((transaction_type = 'SALE' and rent_cold is null) or transaction_type = 'RENT' or rent_cold is null)
);

create table public.property_addresses (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique references public.properties(id) on delete cascade,
  street text not null check (length(trim(street)) > 0),
  house_number text not null check (length(trim(house_number)) > 0),
  postal_code text not null check (length(trim(postal_code)) > 0),
  city text not null check (length(trim(city)) > 0),
  district text,
  country text not null default 'DE',
  latitude numeric(9,6),
  longitude numeric(9,6),
  public_address_mode text not null default 'CITY_ONLY' check (public_address_mode in ('FULL','STREET_ONLY','DISTRICT_ONLY','CITY_ONLY','HIDDEN')),
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0)
);

create table public.property_collaborators (
  property_id uuid not null references public.properties(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  primary key(property_id,user_id)
);

create table public.property_features (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade,
  feature_key text not null check (feature_key ~ '^[A-Z][A-Z0-9_]*$'), label text not null,
  value_type text not null default 'BOOLEAN' check (value_type in ('BOOLEAN','TEXT','NUMBER')),
  boolean_value boolean, text_value text, number_value numeric(14,3), unit text,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0), unique(property_id,feature_key),
  check ((value_type='BOOLEAN' and boolean_value is not null and text_value is null and number_value is null) or (value_type='TEXT' and text_value is not null and boolean_value is null and number_value is null) or (value_type='NUMBER' and number_value is not null and boolean_value is null and text_value is null))
);

create table public.property_energy_data (
  id uuid primary key default gen_random_uuid(), property_id uuid not null unique references public.properties(id) on delete cascade,
  certificate_present boolean not null default false,
  certificate_type text check (certificate_type is null or certificate_type in ('DEMAND','CONSUMPTION','OTHER')),
  energy_value_kwh numeric(10,2) check (energy_value_kwh is null or energy_value_kwh >= 0),
  efficiency_class text check (efficiency_class is null or efficiency_class in ('A+','A','B','C','D','E','F','G','H')),
  energy_source text, building_year integer check (building_year is null or building_year between 1000 and 2200), valid_until date, notes text,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  check (certificate_present or (certificate_type is null and energy_value_kwh is null and efficiency_class is null and valid_until is null))
);

create table public.property_owners (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  ownership_percentage numeric(5,2) check (ownership_percentage is null or (ownership_percentage > 0 and ownership_percentage <= 100)),
  ownership_type text, primary_contact boolean not null default false, valid_from date, valid_until date,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  version bigint not null default 1 check (version > 0),
  check (valid_until is null or valid_from is null or valid_until >= valid_from), unique(property_id,contact_id,valid_from)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(), property_id uuid references public.properties(id) on delete cascade, contact_id uuid references public.contacts(id) on delete set null,
  category text not null check (category in ('LAND_REGISTER','CADASTRAL_MAP','FLOOR_PLAN','LIVING_AREA_CALCULATION','ENERGY_CERTIFICATE','DECLARATION_OF_DIVISION','BUILDING_DOCUMENTS','TENANCY_AGREEMENT','WEG','BUSINESS_PLAN','MINUTES','BROKERAGE_AGREEMENT','PHOTOS','NOTARY','INVOICE','OTHER')),
  classification text not null default 'INTERNAL' check (classification in ('PUBLIC','INTERNAL','CONFIDENTIAL')),
  title text not null check (length(trim(title)) > 0), description text,
  current_version integer not null default 0 check (current_version >= 0), retention_category text, retention_until date, deletion_eligible_at date, legal_hold boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  archived_at timestamptz, archived_by uuid references auth.users(id) on delete set null, version bigint not null default 1 check (version > 0),
  check (property_id is not null or contact_id is not null)
);

create table public.document_versions (
  id uuid primary key default gen_random_uuid(), document_id uuid not null references public.documents(id) on delete cascade,
  version_number integer not null check (version_number > 0), storage_bucket text not null, storage_path text not null, original_filename text not null, mime_type text not null,
  file_size_bytes bigint not null check (file_size_bytes >= 0), sha256 text not null check (sha256 ~ '^[a-fA-F0-9]{64}$'), change_reason text,
  uploaded_at timestamptz not null default now(), uploaded_by uuid references auth.users(id) on delete restrict default auth.uid(),
  unique(document_id,version_number), unique(storage_bucket,storage_path)
);

create table public.property_media (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade,
  media_type text not null check (media_type in ('IMAGE','VIDEO','FLOOR_PLAN','OTHER')), storage_bucket text not null, storage_path text not null,
  title text, alt_text text, sort_order integer not null default 0, public_approved boolean not null default false,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  archived_at timestamptz, archived_by uuid references auth.users(id) on delete set null, version bigint not null default 1 check (version > 0), unique(storage_bucket,storage_path)
);

create table public.property_marketing_checklist_items (
  id uuid primary key default gen_random_uuid(), property_id uuid not null references public.properties(id) on delete cascade,
  item_key text not null, title text not null, category text not null, required boolean not null default true,
  status text not null default 'TODO' check (status in ('TODO','IN_PROGRESS','DONE','WAIVED')), notes text,
  completed_at timestamptz, completed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(), created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(), updated_by uuid references auth.users(id) on delete set null default auth.uid(), version bigint not null default 1 check (version > 0),
  unique(property_id,item_key), check ((status='DONE' and completed_at is not null) or status<>'DONE')
);

alter table public.tasks add column if not exists property_id uuid references public.properties(id) on delete set null;
alter table public.activity_events add constraint activity_events_property_id_fkey foreign key (property_id) references public.properties(id) on delete set null;

create or replace function app_private.validate_property_status_transition()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if old.status is not distinct from new.status then
    if old.archived_at is distinct from new.archived_at then raise exception 'property archive state must be changed through the ARCHIVED status'; end if;
    return new;
  end if;
  if new.status = 'ARCHIVED' then
    if not exists (select 1 from public.property_status_transitions t where t.from_status=old.status and t.to_status='ARCHIVED') then raise exception 'invalid property status transition: % -> ARCHIVED', old.status; end if;
    new.status_before_archive := old.status; new.archived_at := coalesce(new.archived_at, now()); new.archived_by := auth.uid(); return new;
  end if;
  if old.status = 'ARCHIVED' then
    if old.status_before_archive is null or new.status <> old.status_before_archive then raise exception 'archived property can only be restored to its previous status'; end if;
    new.status_before_archive := null; new.archived_at := null; new.archived_by := null; return new;
  end if;
  if not exists (select 1 from public.property_status_transitions t where t.from_status=old.status and t.to_status=new.status) then raise exception 'invalid property status transition: % -> %', old.status, new.status; end if;
  return new;
end;
$$;
revoke all on function app_private.validate_property_status_transition() from public;

create or replace function app_private.validate_property_ownership_total()
returns trigger language plpgsql set search_path = public, pg_temp as $$
declare v_property_id uuid := coalesce(new.property_id, old.property_id); v_total numeric;
begin
  select coalesce(sum(ownership_percentage),0) into v_total from public.property_owners where property_id=v_property_id and ownership_percentage is not null and (valid_from is null or valid_from<=current_date) and (valid_until is null or valid_until>=current_date);
  if v_total>100.00 then raise exception 'active ownership percentages exceed 100%%'; end if; return coalesce(new,old);
end;
$$;
revoke all on function app_private.validate_property_ownership_total() from public;

create or replace function app_private.seed_property_checklist()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into public.property_marketing_checklist_items(property_id,item_key,title,category,required,created_by,updated_by) values
  (new.id,'OWNER_DATA','Eigentümerdaten vollständig','OWNER',true,new.created_by,new.created_by),(new.id,'BROKERAGE_AGREEMENT','Maklervertrag vorhanden','CONTRACT',true,new.created_by,new.created_by),(new.id,'PROPERTY_DATA','Objektstammdaten vollständig','PROPERTY',true,new.created_by,new.created_by),(new.id,'ADDRESS','Objektadresse geprüft','PROPERTY',true,new.created_by,new.created_by),(new.id,'ENERGY','Energiedaten geprüft','ENERGY',true,new.created_by,new.created_by),(new.id,'FLOOR_PLANS','Grundrisse geprüft','DOCUMENTS',false,new.created_by,new.created_by),(new.id,'PHOTOS','Objektfotos vorbereitet','MEDIA',true,new.created_by,new.created_by),(new.id,'PRICE_APPROVAL','Preis/Freigabe dokumentiert','MARKETING',true,new.created_by,new.created_by),(new.id,'DESCRIPTION','Vermarktungstext geprüft','MARKETING',true,new.created_by,new.created_by),(new.id,'PUBLICATION_APPROVAL','Veröffentlichungsfreigabe','MARKETING',true,new.created_by,new.created_by) on conflict do nothing; return new;
end;
$$;
revoke all on function app_private.seed_property_checklist() from public;

create or replace function app_private.audit_property_child()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
declare v_actor uuid:=auth.uid(); v_actor_name text; v_row jsonb; v_property_id uuid; v_property_number text; v_changes jsonb;
begin
  v_row:=case when tg_op='DELETE' then to_jsonb(old) else to_jsonb(new) end; v_property_id:=(v_row->>'property_id')::uuid;
  select display_name into v_actor_name from public.profiles where user_id=v_actor; select property_number into v_property_number from public.properties where id=v_property_id;
  if tg_op='INSERT' then v_changes:=jsonb_build_object(tg_argv[0],jsonb_build_object('old',null,'new',v_row-array['created_at','updated_at','created_by','updated_by','version']));
  elsif tg_op='DELETE' then v_changes:=jsonb_build_object(tg_argv[0],jsonb_build_object('old',v_row-array['created_at','updated_at','created_by','updated_by','version'],'new',null));
  else v_changes:=jsonb_build_object(tg_argv[0],jsonb_build_object('old',to_jsonb(old)-array['created_at','updated_at','created_by','updated_by','version'],'new',to_jsonb(new)-array['created_at','updated_at','created_by','updated_by','version'])); end if;
  insert into public.audit_events(actor_type,actor_user_id,actor_display_name_snapshot,entity_type,entity_id,entity_reference,action,field_changes,source,metadata)
  values(case when v_actor is null then 'SYSTEM' else 'USER' end,v_actor,coalesce(v_actor_name,'System'),'PROPERTY',v_property_id,v_property_number,'UPDATE',v_changes,case when v_actor is null then 'SYSTEM' else 'USER' end,jsonb_build_object('change_type',tg_argv[0],'operation',tg_op)); return coalesce(new,old);
end;
$$;
revoke all on function app_private.audit_property_child() from public;

create trigger properties_validate_status before update on public.properties for each row execute function app_private.validate_property_status_transition();
create trigger properties_set_metadata before update on public.properties for each row execute function app_private.set_business_update_metadata();
create trigger property_addresses_set_metadata before update on public.property_addresses for each row execute function app_private.set_standard_update_metadata();
create trigger property_features_set_metadata before update on public.property_features for each row execute function app_private.set_standard_update_metadata();
create trigger property_energy_set_metadata before update on public.property_energy_data for each row execute function app_private.set_standard_update_metadata();
create trigger property_owners_set_metadata before update on public.property_owners for each row execute function app_private.set_standard_update_metadata();
create trigger documents_set_metadata before update on public.documents for each row execute function app_private.set_business_update_metadata();
create trigger property_media_set_metadata before update on public.property_media for each row execute function app_private.set_business_update_metadata();
create trigger property_checklist_set_metadata before update on public.property_marketing_checklist_items for each row execute function app_private.set_standard_update_metadata();
create trigger property_owners_validate_total after insert or update or delete on public.property_owners for each row execute function app_private.validate_property_ownership_total();
create trigger properties_seed_checklist after insert on public.properties for each row execute function app_private.seed_property_checklist();
create trigger properties_audit after insert or update or delete on public.properties for each row execute function app_private.audit_row_change('PROPERTY','property_number');
create trigger property_addresses_audit after insert or update or delete on public.property_addresses for each row execute function app_private.audit_property_child('ADDRESS');
create trigger property_features_audit after insert or update or delete on public.property_features for each row execute function app_private.audit_property_child('FEATURE');
create trigger property_energy_audit after insert or update or delete on public.property_energy_data for each row execute function app_private.audit_property_child('ENERGY');
create trigger property_owners_audit after insert or update or delete on public.property_owners for each row execute function app_private.audit_property_child('OWNER');
create trigger property_checklist_audit after insert or update or delete on public.property_marketing_checklist_items for each row execute function app_private.audit_property_child('CHECKLIST');
create trigger documents_audit after insert or update or delete on public.documents for each row execute function app_private.audit_row_change('DOCUMENT','id');
create trigger document_versions_audit after insert or delete on public.document_versions for each row execute function app_private.audit_row_change('DOCUMENT_VERSION','original_filename');
create trigger property_media_audit after insert or update or delete on public.property_media for each row execute function app_private.audit_property_child('MEDIA');

create index properties_status_idx on public.properties(status,updated_at desc) where archived_at is null;
create index properties_responsible_idx on public.properties(primary_responsible_user,status) where archived_at is null;
create index properties_type_transaction_idx on public.properties(property_type,transaction_type) where archived_at is null;
create index property_addresses_location_idx on public.property_addresses(postal_code,city,district);
create index property_collaborators_user_idx on public.property_collaborators(user_id,property_id);
create index property_features_property_idx on public.property_features(property_id);
create index property_owners_property_idx on public.property_owners(property_id);
create index property_owners_contact_idx on public.property_owners(contact_id);
create unique index property_owners_primary_active_idx on public.property_owners(property_id) where primary_contact and valid_until is null;
create index documents_property_idx on public.documents(property_id,category) where archived_at is null;
create index documents_contact_idx on public.documents(contact_id,category) where archived_at is null;
create index document_versions_document_idx on public.document_versions(document_id,version_number desc);
create index property_media_property_idx on public.property_media(property_id,sort_order) where archived_at is null;
create index property_checklist_property_idx on public.property_marketing_checklist_items(property_id,status);
create index tasks_property_idx on public.tasks(property_id) where property_id is not null and archived_at is null;
create index activity_events_property_idx on public.activity_events(property_id,occurred_at desc) where property_id is not null;

alter table public.property_status_transitions enable row level security;
alter table public.properties enable row level security;
alter table public.property_addresses enable row level security;
alter table public.property_collaborators enable row level security;
alter table public.property_features enable row level security;
alter table public.property_energy_data enable row level security;
alter table public.property_owners enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.property_media enable row level security;
alter table public.property_marketing_checklist_items enable row level security;

create policy property_status_transitions_select on public.property_status_transitions for select to authenticated using (app_private.has_permission('property.read'));
create policy properties_select on public.properties for select to authenticated using (app_private.has_permission('property.read'));
create policy properties_insert on public.properties for insert to authenticated with check (app_private.has_permission('property.write') and created_by=(select auth.uid()));
create policy properties_update on public.properties for update to authenticated using (app_private.has_permission('property.write')) with check (app_private.has_permission('property.write'));
create policy property_addresses_select on public.property_addresses for select to authenticated using (app_private.has_permission('property.read'));
create policy property_addresses_insert on public.property_addresses for insert to authenticated with check (app_private.has_permission('property.write') and created_by=(select auth.uid()));
create policy property_addresses_update on public.property_addresses for update to authenticated using (app_private.has_permission('property.write')) with check (app_private.has_permission('property.write'));
create policy property_collaborators_select on public.property_collaborators for select to authenticated using (app_private.has_permission('property.read'));
create policy property_collaborators_insert on public.property_collaborators for insert to authenticated with check (app_private.has_permission('property.assign') and created_by=(select auth.uid()));
create policy property_collaborators_delete on public.property_collaborators for delete to authenticated using (app_private.has_permission('property.assign'));
create policy property_features_select on public.property_features for select to authenticated using (app_private.has_permission('property.read'));
create policy property_features_insert on public.property_features for insert to authenticated with check (app_private.has_permission('property.write') and created_by=(select auth.uid()));
create policy property_features_update on public.property_features for update to authenticated using (app_private.has_permission('property.write')) with check (app_private.has_permission('property.write'));
create policy property_features_delete on public.property_features for delete to authenticated using (app_private.has_permission('property.write'));
create policy property_energy_select on public.property_energy_data for select to authenticated using (app_private.has_permission('property.read'));
create policy property_energy_insert on public.property_energy_data for insert to authenticated with check (app_private.has_permission('property.write') and created_by=(select auth.uid()));
create policy property_energy_update on public.property_energy_data for update to authenticated using (app_private.has_permission('property.write')) with check (app_private.has_permission('property.write'));
create policy property_owners_select on public.property_owners for select to authenticated using (app_private.has_permission('property.read'));
create policy property_owners_insert on public.property_owners for insert to authenticated with check (app_private.has_permission('property.write') and created_by=(select auth.uid()));
create policy property_owners_update on public.property_owners for update to authenticated using (app_private.has_permission('property.write')) with check (app_private.has_permission('property.write'));
create policy property_owners_delete on public.property_owners for delete to authenticated using (app_private.has_permission('property.write'));
create policy documents_select on public.documents for select to authenticated using ((classification <> 'CONFIDENTIAL' and app_private.has_permission('document.read')) or (classification='CONFIDENTIAL' and app_private.has_permission('document.confidential.read')));
create policy documents_insert on public.documents for insert to authenticated with check (app_private.has_permission('document.write') and created_by=(select auth.uid()));
create policy documents_update on public.documents for update to authenticated using (app_private.has_permission('document.write')) with check (app_private.has_permission('document.write'));
create policy document_versions_select on public.document_versions for select to authenticated using (exists(select 1 from public.documents d where d.id=document_id and ((d.classification<>'CONFIDENTIAL' and app_private.has_permission('document.read')) or (d.classification='CONFIDENTIAL' and app_private.has_permission('document.confidential.read')))));
create policy document_versions_insert on public.document_versions for insert to authenticated with check (app_private.has_permission('document.write') and uploaded_by=(select auth.uid()) and exists(select 1 from public.documents d where d.id=document_id));
create policy property_media_select on public.property_media for select to authenticated using (app_private.has_permission('property.read'));
create policy property_media_insert on public.property_media for insert to authenticated with check (app_private.has_permission('property.write') and created_by=(select auth.uid()));
create policy property_media_update on public.property_media for update to authenticated using (app_private.has_permission('property.write')) with check (app_private.has_permission('property.write'));
create policy property_checklist_select on public.property_marketing_checklist_items for select to authenticated using (app_private.has_permission('property.read'));
create policy property_checklist_insert on public.property_marketing_checklist_items for insert to authenticated with check (app_private.has_permission('property.write') and created_by=(select auth.uid()));
create policy property_checklist_update on public.property_marketing_checklist_items for update to authenticated using (app_private.has_permission('property.write')) with check (app_private.has_permission('property.write'));
create policy property_checklist_delete on public.property_marketing_checklist_items for delete to authenticated using (app_private.has_permission('property.write'));

revoke all on public.property_status_transitions, public.properties, public.property_addresses, public.property_collaborators, public.property_features, public.property_energy_data, public.property_owners, public.documents, public.document_versions, public.property_media, public.property_marketing_checklist_items from anon;
grant select on public.property_status_transitions to authenticated;
grant select,insert,update on public.properties to authenticated;
grant select,insert,update on public.property_addresses to authenticated;
grant select,insert,delete on public.property_collaborators to authenticated;
grant select,insert,update,delete on public.property_features to authenticated;
grant select,insert,update on public.property_energy_data to authenticated;
grant select,insert,update,delete on public.property_owners to authenticated;
grant select,insert,update on public.documents to authenticated;
grant select,insert on public.document_versions to authenticated;
grant select,insert,update on public.property_media to authenticated;
grant select,insert,update,delete on public.property_marketing_checklist_items to authenticated;

comment on table public.properties is 'Zentrale Immobilien-Stammdaten mit validierter Statusmaschine und Optimistic Concurrency.';
comment on table public.property_addresses is 'Interne vollständige Objektadresse plus expliziter Modus für spätere öffentliche Darstellung.';
comment on table public.property_owners is 'Zeitlich gültige Eigentümerrelationen; aktive Prozentanteile dürfen insgesamt 100 Prozent nicht überschreiten.';
comment on table public.document_versions is 'Append-only Dokumentversionen. Bestehende Versionen werden nicht überschrieben.';
