-- Technisches Immobilienaufmass: Grundrisse und Wohnflaechenberechnung
--
-- WARUM DAS EIN EIGENER VORGANG IST UND KEIN FELD AN DER IMMOBILIE
--
-- Ein Aufmass ist eine Dienstleistung, die auch ohne Maklerauftrag verkauft
-- wird: an Eigentuemer, die gar nicht verkaufen wollen, an Kaeufer vor der
-- Finanzierung, an Sachverstaendige. Es hat einen Kunden, einen Preis, einen
-- Termin und eine Lieferung -- also einen eigenen Lebenslauf. Als Feld an
-- public.properties waere es nur dort erfassbar, wo das Objekt ohnehin schon
-- im Bestand ist, und das ist der kleinere Teil der Faelle.
--
-- Deshalb ist property_id ausdruecklich NULL-faehig. Statt der Objektakte
-- traegt der Auftrag dann die Anschrift selbst. Mindestens eines von beidem
-- muss da sein, sonst weiss niemand, was aufgemessen werden soll:
-- measurement_orders_zuordnung_check.
--
-- WAS DAS MODUL AUSDRUECKLICH NICHT TUT
--
-- Es rechnet keine Wohnflaeche aus. Die Flaechenangaben, die hier stehen, sind
-- das Ergebnis einer Berechnung, die ausserhalb entsteht und als Unterlage
-- beiliegt; das CRM speichert das Ergebnis und die Grundlage (WoFlV, DIN 277),
-- nicht den Rechenweg. Es erzeugt auch keine Rechnung: fee_amount und
-- invoice_reference dokumentieren, was vereinbart und wo abgerechnet wurde --
-- wie bei den Provisionen.
--
-- DIE RUECKSCHREIBUNG IST EINE HANDLUNG, KEIN TRIGGER
--
-- Ein fertiges Aufmass liefert genau den Nachweis, der
-- property_legal_data.living_area_basis von 'ESTIMATED' oder 'UNKNOWN' auf
-- 'WOFLV' oder 'DIN_277' hebt. Diese Uebernahme steht in der Akte als eigener
-- Knopf und nicht in einem Trigger: die Wohnflaeche einer Immobilie
-- stillschweigend zu aendern, waehrend jemand einen Auftrag abhakt, waere
-- genau die Art von Nebenwirkung, die spaeter niemand mehr zuordnen kann.

create sequence if not exists public.measurement_order_number_seq;

-- ---------------------------------------------------------------- Statusmaschine

create table if not exists public.measurement_order_status_transitions (
  from_status text not null,
  to_status text not null,
  description text,
  primary key (from_status, to_status),
  constraint measurement_order_transitions_from_check check (from_status in ('DRAFT','REQUESTED','OFFERED','ACCEPTED','SCHEDULED','MEASURED','DELIVERED','INVOICED','PAID','CANCELLED')),
  constraint measurement_order_transitions_to_check check (to_status in ('DRAFT','REQUESTED','OFFERED','ACCEPTED','SCHEDULED','MEASURED','DELIVERED','INVOICED','PAID','CANCELLED'))
);

-- ACCEPTED → DELIVERED ohne Aufmasstermin ist kein Versehen: der Grundriss-
-- Refresh zeichnet vorhandene Unterlagen neu und war nie vor Ort.
insert into public.measurement_order_status_transitions(from_status,to_status,description) values
  ('DRAFT','REQUESTED','Anfrage erfassen'),
  ('DRAFT','OFFERED','Angebot abgegeben'),
  ('DRAFT','ACCEPTED','Direkt beauftragt'),
  ('DRAFT','CANCELLED','Entwurf verwerfen'),
  ('REQUESTED','OFFERED','Angebot abgegeben'),
  ('REQUESTED','ACCEPTED','Auftrag erteilt'),
  ('REQUESTED','CANCELLED','Anfrage verworfen'),
  ('OFFERED','ACCEPTED','Angebot angenommen'),
  ('OFFERED','CANCELLED','Angebot abgelehnt oder verfallen'),
  ('ACCEPTED','SCHEDULED','Aufmasstermin vereinbart'),
  ('ACCEPTED','MEASURED','Aufmass ohne vorherigen Termineintrag erfolgt'),
  ('ACCEPTED','DELIVERED','Ohne Vor-Ort-Aufmass ausgearbeitet und geliefert'),
  ('ACCEPTED','CANCELLED','Auftrag zurueckgezogen'),
  ('SCHEDULED','MEASURED','Vor Ort aufgemessen'),
  ('SCHEDULED','ACCEPTED','Termin entfaellt, Auftrag bleibt'),
  ('SCHEDULED','CANCELLED','Auftrag zurueckgezogen'),
  ('MEASURED','DELIVERED','Unterlagen uebergeben'),
  ('MEASURED','CANCELLED','Auftrag zurueckgezogen'),
  ('DELIVERED','INVOICED','Rechnung gestellt'),
  ('DELIVERED','PAID','Bezahlt, ohne eigene Rechnungsstellung im CRM'),
  ('INVOICED','PAID','Zahlung eingegangen'),
  ('INVOICED','CANCELLED','Rechnung storniert'),
  ('CANCELLED','DRAFT','Verworfenen Vorgang erneut oeffnen')
on conflict do nothing;

-- ---------------------------------------------------------------- Auftrag

create table if not exists public.measurement_orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique default ('ZM-AM-' || lpad(nextval('public.measurement_order_number_seq'::regclass)::text, 6, '0')),
  service_package text not null check (service_package in ('FLOOR_PLAN_REFRESH','AS_BUILT','SALE_FINANCE','HOUSE_PREMIUM','INDIVIDUAL')),
  property_id uuid constraint measurement_orders_property_id_fkey references public.properties(id),
  contact_id uuid constraint measurement_orders_contact_id_fkey references public.contacts(id),
  object_street text,
  object_house_number text,
  object_postal_code text check (object_postal_code is null or object_postal_code ~ '^\d{5}$'),
  object_city text,
  property_type text check (property_type is null or property_type in ('DETACHED_HOUSE','SEMI_DETACHED_HOUSE','TERRACED_HOUSE','APARTMENT_BUILDING','APARTMENT','PENTHOUSE','MAISONETTE','LAND','COMMERCIAL','OFFICE','RETAIL','OTHER')),
  approx_area_sqm numeric(12,2) check (approx_area_sqm is null or approx_area_sqm > 0),
  floor_count integer check (floor_count is null or (floor_count >= 1 and floor_count <= 20)),
  requested_on date not null default current_date,
  appointment_at timestamptz,
  measured_on date,
  delivered_on date,
  area_standard text not null default 'NONE' check (area_standard in ('NONE','WOFLV','DIN_277','BOTH')),
  measured_living_area_sqm numeric(12,2) check (measured_living_area_sqm is null or measured_living_area_sqm > 0),
  measured_usable_area_sqm numeric(12,2) check (measured_usable_area_sqm is null or measured_usable_area_sqm > 0),
  fee_amount numeric(14,2) check (fee_amount is null or fee_amount >= 0),
  fee_basis text,
  invoice_reference text,
  invoiced_on date,
  paid_on date,
  source text not null default 'INTERNAL' check (source in ('WEBSITE','PHONE','EMAIL','IN_PERSON','REFERRAL','INTERNAL')),
  customer_message text,
  internal_notes text,
  status text not null default 'DRAFT' check (status in ('DRAFT','REQUESTED','OFFERED','ACCEPTED','SCHEDULED','MEASURED','DELIVERED','INVOICED','PAID','CANCELLED')),
  primary_responsible_user uuid not null default auth.uid() constraint measurement_orders_primary_responsible_user_fkey references public.profiles(user_id),
  website_submission_key text unique,
  public_source_url text,
  consent_given_at timestamptz,
  consent_text_version text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid() constraint measurement_orders_created_by_fkey references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid() constraint measurement_orders_updated_by_fkey references public.profiles(user_id),
  archived_at timestamptz,
  archived_by uuid constraint measurement_orders_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),
  constraint measurement_orders_zuordnung_check check (property_id is not null or contact_id is not null),
  constraint measurement_orders_delivery_order_check check (delivered_on is null or measured_on is null or delivered_on >= measured_on),
  constraint measurement_orders_payment_order_check check (paid_on is null or invoiced_on is null or paid_on >= invoiced_on)
);

comment on table public.measurement_orders is 'Auftrag ueber ein technisches Immobilienaufmass: Grundriss, Bestandsaufmass, Wohnflaechenberechnung. Eigener Vorgang mit eigener Nummer, auch ohne Objektakte und ohne Maklerauftrag.';
comment on column public.measurement_orders.property_id is 'Nur gesetzt, wenn das Objekt im eigenen Bestand gefuehrt wird. Sonst traegt der Auftrag die Anschrift selbst.';
comment on column public.measurement_orders.area_standard is 'Grundlage der Flaechenermittlung. Passt zu property_legal_data.living_area_basis und wird bei der Uebernahme dorthin geschrieben.';
comment on column public.measurement_orders.measured_living_area_sqm is 'Ergebnis der Berechnung, die als Unterlage beiliegt. Das CRM rechnet selbst nichts aus.';
comment on column public.measurement_orders.fee_amount is 'Vereinbartes Honorar. Das CRM erzeugt keine Rechnung; invoice_reference verweist auf die extern erstellte.';
comment on column public.measurement_orders.website_submission_key is 'Ein Schluessel je Einsendung des oeffentlichen Formulars. Verhindert, dass ein zweiter Klick einen zweiten Auftrag anlegt.';

create index if not exists measurement_orders_property_idx on public.measurement_orders(property_id) where archived_at is null;
create index if not exists measurement_orders_contact_idx on public.measurement_orders(contact_id) where archived_at is null;
create index if not exists measurement_orders_status_idx on public.measurement_orders(status) where archived_at is null;
create index if not exists measurement_orders_appointment_idx on public.measurement_orders(appointment_at) where archived_at is null and appointment_at is not null;
create index if not exists measurement_orders_responsible_idx on public.measurement_orders(primary_responsible_user);
create index if not exists measurement_orders_created_by_idx on public.measurement_orders(created_by);
create index if not exists measurement_orders_updated_by_idx on public.measurement_orders(updated_by);
create index if not exists measurement_orders_archived_by_idx on public.measurement_orders(archived_by);

-- ---------------------------------------------------------------- Unterlagen am Auftrag

create table if not exists public.measurement_order_documents (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null constraint measurement_order_documents_order_id_fkey references public.measurement_orders(id) on delete cascade,
  document_id uuid not null constraint measurement_order_documents_document_id_fkey references public.documents(id),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() constraint measurement_order_documents_created_by_fkey references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() constraint measurement_order_documents_updated_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),
  unique (order_id, document_id)
);

comment on table public.measurement_order_documents is 'Verweist auf die Unterlagen, die aus dem Auftrag entstanden sind. Die Dateien selbst liegen wie alle anderen in documents/document_versions -- hier entsteht keine zweite Dateiverwaltung.';

create index if not exists measurement_order_documents_document_idx on public.measurement_order_documents(document_id);
create index if not exists measurement_order_documents_created_by_idx on public.measurement_order_documents(created_by);
create index if not exists measurement_order_documents_updated_by_idx on public.measurement_order_documents(updated_by);

-- ---------------------------------------------------------------- Aufgaben anbinden

alter table public.tasks add column if not exists measurement_order_id uuid
  constraint tasks_measurement_order_id_fkey references public.measurement_orders(id) on delete set null;
create index if not exists tasks_measurement_order_idx on public.tasks(measurement_order_id) where measurement_order_id is not null;

-- ---------------------------------------------------------------- Berechtigungen

insert into public.permissions(key,description) values
  ('measurement.read','Aufmass-Auftraege lesen'),
  ('measurement.write','Aufmass-Auftraege bearbeiten'),
  ('measurement.archive','Aufmass-Auftraege archivieren')
on conflict (key) do update set description = excluded.description;

-- admin hat die Grundrechte seinerzeit per cross join bekommen; neue Schluessel
-- muss man ihm ausdruecklich zuweisen, sonst fehlen sie ihm.
insert into public.role_permissions(role_id,permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.key in ('measurement.read','measurement.write','measurement.archive')
where r.key in ('admin','managing_director')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.key in ('measurement.read','measurement.write')
where r.key = 'agent'
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id, p.id from public.roles r
join public.permissions p on p.key = 'measurement.read'
where r.key in ('assistance','marketing')
on conflict do nothing;

-- ---------------------------------------------------------------- Pruefung

create or replace function app_private.validate_measurement_order()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if tg_op='INSERT' and new.status not in ('DRAFT','REQUESTED') then
    raise exception 'MEASUREMENT_MUST_START_DRAFT_OR_REQUESTED' using errcode='22023';
  end if;

  if tg_op='UPDATE' then
    if old.order_number is distinct from new.order_number then
      raise exception 'MEASUREMENT_NUMBER_IMMUTABLE' using errcode='42501';
    end if;
    if old.status is distinct from new.status and not exists(
      select 1 from public.measurement_order_status_transitions t
      where t.from_status=old.status and t.to_status=new.status
    ) then
      raise exception 'INVALID_MEASUREMENT_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';
    end if;
    if old.archived_at is not null and new.archived_at is not null and row(
      new.service_package,new.property_id,new.contact_id,new.object_street,new.object_house_number,
      new.object_postal_code,new.object_city,new.property_type,new.approx_area_sqm,new.floor_count,
      new.requested_on,new.appointment_at,new.measured_on,new.delivered_on,new.area_standard,
      new.measured_living_area_sqm,new.measured_usable_area_sqm,new.fee_amount,new.fee_basis,
      new.invoice_reference,new.invoiced_on,new.paid_on,new.source,new.customer_message,
      new.internal_notes,new.status,new.primary_responsible_user
    ) is distinct from row(
      old.service_package,old.property_id,old.contact_id,old.object_street,old.object_house_number,
      old.object_postal_code,old.object_city,old.property_type,old.approx_area_sqm,old.floor_count,
      old.requested_on,old.appointment_at,old.measured_on,old.delivered_on,old.area_standard,
      old.measured_living_area_sqm,old.measured_usable_area_sqm,old.fee_amount,old.fee_basis,
      old.invoice_reference,old.invoiced_on,old.paid_on,old.source,old.customer_message,
      old.internal_notes,old.status,old.primary_responsible_user
    ) then
      raise exception 'ARCHIVED_MEASUREMENT_IMMUTABLE' using errcode='22023';
    end if;
  end if;

  if new.property_id is not null and not exists(select 1 from public.properties p where p.id=new.property_id) then
    raise exception 'MEASUREMENT_PROPERTY_NOT_FOUND' using errcode='P0002';
  end if;
  if new.contact_id is not null and not exists(select 1 from public.contacts c where c.id=new.contact_id) then
    raise exception 'MEASUREMENT_CONTACT_NOT_FOUND' using errcode='P0002';
  end if;
  if not exists(select 1 from public.profiles p where p.user_id=new.primary_responsible_user and p.status='ACTIVE') then
    raise exception 'MEASUREMENT_RESPONSIBLE_USER_INACTIVE' using errcode='22023';
  end if;

  -- Ein Zustand behauptet etwas ueber die Wirklichkeit. Wer "aufgemessen"
  -- setzt, ohne zu sagen wann, hat den Haken gesetzt und nicht die Arbeit.
  if new.status='MEASURED' and new.measured_on is null then
    raise exception 'MEASUREMENT_MEASURED_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status in ('DELIVERED','INVOICED','PAID') and new.delivered_on is null then
    raise exception 'MEASUREMENT_DELIVERY_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status in ('INVOICED','PAID') and (new.fee_amount is null or new.invoiced_on is null) then
    raise exception 'MEASUREMENT_INVOICE_DETAILS_REQUIRED' using errcode='22023';
  end if;
  if new.status='PAID' and new.paid_on is null then
    raise exception 'MEASUREMENT_PAYMENT_DATE_REQUIRED' using errcode='22023';
  end if;

  -- Eine Flaechengrundlage ohne Flaeche ist eine Behauptung ueber nichts.
  if new.area_standard <> 'NONE'
     and new.measured_living_area_sqm is null and new.measured_usable_area_sqm is null then
    raise exception 'MEASUREMENT_AREA_REQUIRED_FOR_STANDARD' using errcode='22023';
  end if;

  return new;
end;
$function$;
revoke all on function app_private.validate_measurement_order() from public, anon, authenticated;

-- ---------------------------------------------------------------- Aufnahme ueber die Website

create or replace function public.create_public_measurement_order(
  p_contact_id uuid,
  p_responsible_user uuid,
  p_submission_key text,
  p_source_url text,
  p_service_package text,
  p_property_type text,
  p_object_postal_code text,
  p_object_city text,
  p_approx_area_sqm numeric,
  p_floor_count integer,
  p_message text,
  p_consent_text_version text
)
returns table(out_order_id uuid, out_order_number text, out_deduplicated boolean)
language plpgsql
security definer
set search_path = public, app_private, pg_temp
as $$
begin
  if coalesce(auth.jwt() ->> 'role', '') <> 'service_role' then
    raise exception 'SERVICE_ROLE_REQUIRED' using errcode = '42501';
  end if;
  if p_contact_id is null
     or p_responsible_user is null
     or length(trim(coalesce(p_submission_key, ''))) < 16
     or p_service_package is null
     or nullif(trim(coalesce(p_consent_text_version, '')), '') is null then
    raise exception 'INVALID_MEASUREMENT_INTAKE' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.user_id = p_responsible_user and p.status = 'ACTIVE') then
    raise exception 'RESPONSIBLE_USER_NOT_ACTIVE' using errcode = '22023';
  end if;

  return query
  select o.id, o.order_number, true
  from public.measurement_orders o where o.website_submission_key = trim(p_submission_key);
  if found then return; end if;

  return query
  insert into public.measurement_orders(
    service_package, contact_id, object_postal_code, object_city, property_type,
    approx_area_sqm, floor_count, status, source, customer_message,
    primary_responsible_user, website_submission_key, public_source_url,
    consent_given_at, consent_text_version, created_by, updated_by
  ) values (
    p_service_package, p_contact_id, nullif(trim(p_object_postal_code), ''), nullif(trim(p_object_city), ''),
    nullif(trim(p_property_type), ''), p_approx_area_sqm, p_floor_count, 'REQUESTED', 'WEBSITE',
    nullif(trim(coalesce(p_message, '')), ''), p_responsible_user, trim(p_submission_key),
    nullif(trim(p_source_url), ''), now(), p_consent_text_version, null, null
  )
  returning id, order_number, false;
exception
  when unique_violation then
    return query
    select o.id, o.order_number, true
    from public.measurement_orders o where o.website_submission_key = trim(p_submission_key);
end;
$$;
revoke all on function public.create_public_measurement_order(uuid, uuid, text, text, text, text, text, text, numeric, integer, text, text) from public, anon, authenticated;
grant execute on function public.create_public_measurement_order(uuid, uuid, text, text, text, text, text, text, numeric, integer, text, text) to service_role;

-- ---------------------------------------------------------------- Zielsteuerung des Formulars

alter table public.sales_readiness_public_intake_config
  drop constraint if exists sales_readiness_public_intake_config_id_check;
alter table public.sales_readiness_public_intake_config
  add constraint sales_readiness_public_intake_config_id_check
  check (id in ('SELLER_CHECK', 'VALUATION', 'SEARCH_PROFILE', 'MEASUREMENT'));

-- Der Weg beginnt geschlossen. Ein Formular ohne eingetragenen Empfaenger nimmt
-- Anfragen entgegen, die niemandem auffallen.
insert into public.sales_readiness_public_intake_config(id, enabled, responsible_user)
values ('MEASUREMENT', false, null)
on conflict (id) do nothing;

-- ---------------------------------------------------------------- RLS

alter table public.measurement_orders enable row level security;
alter table public.measurement_order_documents enable row level security;
alter table public.measurement_order_status_transitions enable row level security;

drop policy if exists measurement_orders_select on public.measurement_orders;
create policy measurement_orders_select on public.measurement_orders for select to authenticated
using ((select app_private.has_permission('measurement.read')));

drop policy if exists measurement_orders_insert on public.measurement_orders;
create policy measurement_orders_insert on public.measurement_orders for insert to authenticated
with check ((select app_private.has_permission('measurement.write')) and created_by=(select auth.uid()));

drop policy if exists measurement_orders_update on public.measurement_orders;
create policy measurement_orders_update on public.measurement_orders for update to authenticated
using ((select app_private.has_permission('measurement.write')))
with check ((select app_private.has_permission('measurement.write')));

drop policy if exists measurement_order_documents_select on public.measurement_order_documents;
create policy measurement_order_documents_select on public.measurement_order_documents for select to authenticated
using ((select app_private.has_permission('measurement.read')));

drop policy if exists measurement_order_documents_insert on public.measurement_order_documents;
create policy measurement_order_documents_insert on public.measurement_order_documents for insert to authenticated
with check ((select app_private.has_permission('measurement.write')) and created_by=(select auth.uid()));

drop policy if exists measurement_order_documents_update on public.measurement_order_documents;
create policy measurement_order_documents_update on public.measurement_order_documents for update to authenticated
using ((select app_private.has_permission('measurement.write')))
with check ((select app_private.has_permission('measurement.write')));

drop policy if exists measurement_order_documents_delete on public.measurement_order_documents;
create policy measurement_order_documents_delete on public.measurement_order_documents for delete to authenticated
using ((select app_private.has_permission('measurement.write')));

drop policy if exists measurement_order_status_transitions_select on public.measurement_order_status_transitions;
create policy measurement_order_status_transitions_select on public.measurement_order_status_transitions for select to authenticated
using ((select app_private.has_permission('measurement.read')));

-- ---------------------------------------------------------------- Trigger

drop trigger if exists measurement_orders_10_validate on public.measurement_orders;
create trigger measurement_orders_10_validate before insert or update on public.measurement_orders
for each row execute function app_private.validate_measurement_order();

drop trigger if exists measurement_orders_20_archive_guard on public.measurement_orders;
create trigger measurement_orders_20_archive_guard before update on public.measurement_orders
for each row execute function app_private.enforce_archive_permission('measurement.archive');

drop trigger if exists measurement_orders_90_set_update_metadata on public.measurement_orders;
create trigger measurement_orders_90_set_update_metadata before update on public.measurement_orders
for each row execute function app_private.set_business_update_metadata();

drop trigger if exists measurement_orders_audit on public.measurement_orders;
create trigger measurement_orders_audit after insert or update or delete on public.measurement_orders
for each row execute function app_private.audit_row_change('MEASUREMENT_ORDER','order_number');

drop trigger if exists measurement_order_documents_40_metadata on public.measurement_order_documents;
create trigger measurement_order_documents_40_metadata before update on public.measurement_order_documents
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists measurement_order_documents_90_audit on public.measurement_order_documents;
create trigger measurement_order_documents_90_audit after insert or update or delete on public.measurement_order_documents
for each row execute function app_private.audit_row_change('MEASUREMENT_ORDER_DOCUMENT','id');

-- ---------------------------------------------------------------- Data-API-Rechte

grant select, insert, update on public.measurement_orders to authenticated;
grant select, insert, update, delete on public.measurement_order_documents to authenticated;
grant select on public.measurement_order_status_transitions to authenticated;
grant usage, select on sequence public.measurement_order_number_seq to authenticated;
