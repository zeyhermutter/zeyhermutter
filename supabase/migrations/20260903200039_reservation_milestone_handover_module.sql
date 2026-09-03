-- Thema 6 (Maklerpraxis): Reservierung, Notar-Meilensteine und Uebergabeprotokoll.
-- Zwischen Beurkundung und Eigentumsumschreibung soll nichts mehr ausserhalb des
-- Systems verwaltet werden. Die bestehende Statusmaschine der Abschlussakte bleibt
-- unveraendert; die Meilensteine liegen daneben, nicht darin.

insert into public.permissions(key,description) values
  ('reservation.read','Reservierungen lesen'),
  ('reservation.write','Reservierungen bearbeiten'),
  ('reservation.archive','Reservierungen archivieren')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('reservation.read','reservation.write')
where r.key in ('admin','managing_director','agent','assistance')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key = 'reservation.archive'
where r.key in ('admin','managing_director')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Reservierung
-- ---------------------------------------------------------------------------
create sequence if not exists public.reservation_number_seq;

create table if not exists public.property_reservations (
  id uuid primary key default gen_random_uuid(),
  reservation_number text not null unique default ('ZM-RS-' || lpad(nextval('public.reservation_number_seq'::regclass)::text, 6, '0')),
  property_id uuid not null constraint property_reservations_property_id_fkey references public.properties(id) on delete restrict,
  contact_id uuid not null constraint property_reservations_contact_id_fkey references public.contacts(id) on delete restrict,
  purchase_offer_id uuid constraint property_reservations_purchase_offer_id_fkey references public.purchase_offers(id) on delete set null,

  reserved_from date not null default current_date,
  reserved_until date not null,
  reserved_price numeric(14,2) check (reserved_price is null or reserved_price > 0),
  conditions text,
  agreement_documented boolean not null default false,

  -- Reservierungsentgelte sind rechtlich heikel. Das System erfasst sie nur;
  -- es schlaegt keinen Betrag vor und berechnet nichts daraus.
  fee_amount numeric(12,2) check (fee_amount is null or fee_amount >= 0),
  fee_note text,

  status text not null default 'ACTIVE'
    check (status in ('ACTIVE','EXPIRED','CONVERTED','CANCELLED')),
  ended_on date,
  end_reason text,

  primary_responsible_user uuid not null default auth.uid() constraint property_reservations_primary_responsible_user_fkey references public.profiles(user_id),
  internal_notes text,

  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() constraint property_reservations_created_by_fkey references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() constraint property_reservations_updated_by_fkey references public.profiles(user_id),
  archived_at timestamptz,
  archived_by uuid constraint property_reservations_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),

  constraint property_reservations_period_check check (reserved_until >= reserved_from),
  constraint property_reservations_ended_check check (status = 'ACTIVE' or ended_on is not null),
  constraint property_reservations_active_check check (status <> 'ACTIVE' or (ended_on is null and coalesce(btrim(end_reason),'') = '')),
  constraint property_reservations_cancel_reason_check check (status <> 'CANCELLED' or coalesce(btrim(end_reason),'') <> '')
);

comment on table public.property_reservations is 'Reservierungsvereinbarung zwischen Interessent und Objekt. Ein etwaiges Reservierungsentgelt wird nur dokumentiert; das System schlaegt keines vor, berechnet nichts und trifft keine Aussage zur Zulaessigkeit.';
comment on column public.property_reservations.fee_amount is 'Nur Dokumentation eines tatsaechlich vereinbarten Entgelts. Keine Empfehlung, keine Berechnung, keine rechtliche Bewertung.';

create unique index if not exists property_reservations_one_active_idx
  on public.property_reservations(property_id) where status = 'ACTIVE' and archived_at is null;
create index if not exists property_reservations_property_idx on public.property_reservations(property_id, status);
create index if not exists property_reservations_contact_idx on public.property_reservations(contact_id);
create index if not exists property_reservations_offer_idx on public.property_reservations(purchase_offer_id);
create index if not exists property_reservations_expiry_idx on public.property_reservations(reserved_until) where status = 'ACTIVE' and archived_at is null;
create index if not exists property_reservations_responsible_idx on public.property_reservations(primary_responsible_user);
create index if not exists property_reservations_created_by_idx on public.property_reservations(created_by);
create index if not exists property_reservations_updated_by_idx on public.property_reservations(updated_by);
create index if not exists property_reservations_archived_by_idx on public.property_reservations(archived_by);

-- ---------------------------------------------------------------------------
-- Notar-Meilensteine
-- ---------------------------------------------------------------------------
create table if not exists public.sale_closing_milestones (
  id uuid primary key default gen_random_uuid(),
  sale_closing_id uuid not null constraint sale_closing_milestones_closing_id_fkey references public.sale_closings(id) on delete cascade,
  milestone_key text not null,
  title text not null,
  sort_order integer not null default 0,

  applicability text not null default 'REQUIRED'
    check (applicability in ('REQUIRED','NOT_APPLICABLE','UNCLEAR')),
  initiated_on date,
  completed_on date,
  deadline_on date,
  reference text,
  responsible_user uuid constraint sale_closing_milestones_responsible_user_fkey references public.profiles(user_id),
  note text,

  created_at timestamptz not null default now(),
  created_by uuid constraint sale_closing_milestones_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint sale_closing_milestones_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),

  unique (sale_closing_id, milestone_key),
  constraint sale_closing_milestones_dates_check check (
    completed_on is null or initiated_on is null or completed_on >= initiated_on
  ),
  constraint sale_closing_milestones_not_applicable_check check (
    applicability <> 'NOT_APPLICABLE' or (initiated_on is null and completed_on is null and deadline_on is null)
  )
);

comment on table public.sale_closing_milestones is 'Notarielle Meilensteine je Abschlussvorgang zwischen Beurkundung und Eigentumsumschreibung. Bewusst neben der bestehenden Statusmaschine, nicht als zweite Statusmaschine.';
comment on column public.sale_closing_milestones.applicability is 'Ob der Meilenstein im konkreten Fall einschlaegig ist. Das entscheidet der Bearbeiter, nicht das System.';

create index if not exists sale_closing_milestones_closing_idx on public.sale_closing_milestones(sale_closing_id, sort_order);
create index if not exists sale_closing_milestones_open_idx on public.sale_closing_milestones(sale_closing_id) where completed_on is null and applicability <> 'NOT_APPLICABLE';
create index if not exists sale_closing_milestones_deadline_idx on public.sale_closing_milestones(deadline_on) where completed_on is null;
create index if not exists sale_closing_milestones_responsible_idx on public.sale_closing_milestones(responsible_user);
create index if not exists sale_closing_milestones_created_by_idx on public.sale_closing_milestones(created_by);
create index if not exists sale_closing_milestones_updated_by_idx on public.sale_closing_milestones(updated_by);

create or replace function app_private.seed_sale_closing_milestones()
returns trigger
language plpgsql
security definer
set search_path to 'public','pg_temp'
as $function$
begin
  insert into public.sale_closing_milestones(sale_closing_id,milestone_key,title,sort_order,created_by,updated_by) values
    (new.id,'PRIORITY_NOTICE','Auflassungsvormerkung eingetragen',10,new.created_by,new.created_by),
    (new.id,'ENCUMBRANCE_RELEASE','Lastenfreistellung und Löschungsbewilligungen',20,new.created_by,new.created_by),
    (new.id,'MUNICIPAL_PRE_EMPTION','Vorkaufsrecht der Gemeinde',30,new.created_by,new.created_by),
    (new.id,'TENANT_PRE_EMPTION','Vorkaufsrecht des Mieters',40,new.created_by,new.created_by),
    (new.id,'HOA_MANAGER_CONSENT','Verwalterzustimmung bei WEG',50,new.created_by,new.created_by),
    (new.id,'NOTARY_DUE_NOTICE','Fälligkeitsmitteilung des Notars',60,new.created_by,new.created_by),
    (new.id,'TRANSFER_TAX_ASSESSMENT','Grunderwerbsteuerbescheid',70,new.created_by,new.created_by),
    (new.id,'TAX_CLEARANCE','Unbedenklichkeitsbescheinigung',80,new.created_by,new.created_by),
    (new.id,'TITLE_TRANSFER','Eigentumsumschreibung im Grundbuch',90,new.created_by,new.created_by)
  on conflict do nothing;
  return new;
end;
$function$;

revoke all on function app_private.seed_sale_closing_milestones() from public, anon, authenticated;

drop trigger if exists sale_closings_50_seed_milestones on public.sale_closings;
create trigger sale_closings_50_seed_milestones after insert on public.sale_closings
for each row execute function app_private.seed_sale_closing_milestones();

-- Bestandsvorgaenge bekommen die Meilensteine nachtraeglich.
insert into public.sale_closing_milestones(sale_closing_id,milestone_key,title,sort_order,created_by,updated_by)
select c.id, m.key, m.title, m.sort_order, c.created_by, c.created_by
from public.sale_closings c
cross join (values
  ('PRIORITY_NOTICE','Auflassungsvormerkung eingetragen',10),
  ('ENCUMBRANCE_RELEASE','Lastenfreistellung und Löschungsbewilligungen',20),
  ('MUNICIPAL_PRE_EMPTION','Vorkaufsrecht der Gemeinde',30),
  ('TENANT_PRE_EMPTION','Vorkaufsrecht des Mieters',40),
  ('HOA_MANAGER_CONSENT','Verwalterzustimmung bei WEG',50),
  ('NOTARY_DUE_NOTICE','Fälligkeitsmitteilung des Notars',60),
  ('TRANSFER_TAX_ASSESSMENT','Grunderwerbsteuerbescheid',70),
  ('TAX_CLEARANCE','Unbedenklichkeitsbescheinigung',80),
  ('TITLE_TRANSFER','Eigentumsumschreibung im Grundbuch',90)
) as m(key,title,sort_order)
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Uebergabeprotokoll
-- ---------------------------------------------------------------------------
create table if not exists public.sale_handover_protocols (
  id uuid primary key default gen_random_uuid(),
  sale_closing_id uuid not null unique constraint sale_handover_protocols_closing_id_fkey references public.sale_closings(id) on delete cascade,
  handover_at timestamptz,
  attendees text,
  room_condition text,
  remaining_inventory text,
  defects text,
  energy_certificate_handed_over boolean not null default false,
  remarks text,
  document_id uuid constraint sale_handover_protocols_document_id_fkey references public.documents(id) on delete set null,

  seller_confirmed_at timestamptz,
  seller_confirmed_name text,
  buyer_confirmed_at timestamptz,
  buyer_confirmed_name text,

  created_at timestamptz not null default now(),
  created_by uuid constraint sale_handover_protocols_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint sale_handover_protocols_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),

  constraint sale_handover_protocols_seller_check check (
    seller_confirmed_at is null or coalesce(btrim(seller_confirmed_name),'') <> ''
  ),
  constraint sale_handover_protocols_buyer_check check (
    buyer_confirmed_at is null or coalesce(btrim(buyer_confirmed_name),'') <> ''
  )
);

comment on table public.sale_handover_protocols is 'Uebergabeprotokoll je Abschlussvorgang. Die Bestaetigung beider Seiten wird als Name und Zeitpunkt dokumentiert; das System erzeugt keine rechtsverbindliche Unterschrift.';

create index if not exists sale_handover_protocols_document_idx on public.sale_handover_protocols(document_id);
create index if not exists sale_handover_protocols_created_by_idx on public.sale_handover_protocols(created_by);
create index if not exists sale_handover_protocols_updated_by_idx on public.sale_handover_protocols(updated_by);

create table if not exists public.sale_handover_meters (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null constraint sale_handover_meters_protocol_id_fkey references public.sale_handover_protocols(id) on delete cascade,
  meter_type text not null check (meter_type in ('ELECTRICITY','GAS','WATER_COLD','WATER_HOT','HEAT','OTHER')),
  meter_number text,
  reading numeric(14,3) not null check (reading >= 0),
  unit text,
  read_on date not null default current_date,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid constraint sale_handover_meters_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint sale_handover_meters_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),
  constraint sale_handover_meters_read_date_check check (read_on <= current_date)
);

create index if not exists sale_handover_meters_protocol_idx on public.sale_handover_meters(protocol_id);
create index if not exists sale_handover_meters_created_by_idx on public.sale_handover_meters(created_by);
create index if not exists sale_handover_meters_updated_by_idx on public.sale_handover_meters(updated_by);

create table if not exists public.sale_handover_keys (
  id uuid primary key default gen_random_uuid(),
  protocol_id uuid not null constraint sale_handover_keys_protocol_id_fkey references public.sale_handover_protocols(id) on delete cascade,
  key_type text not null check (key_type in ('HOUSE_DOOR','APARTMENT','BASEMENT','ATTIC','MAILBOX','GARAGE','GATE','WINDOW','UTILITY_ROOM','OTHER')),
  label text,
  quantity integer not null check (quantity > 0),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid constraint sale_handover_keys_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint sale_handover_keys_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),
  unique (protocol_id, key_type, label)
);

create index if not exists sale_handover_keys_protocol_idx on public.sale_handover_keys(protocol_id);
create index if not exists sale_handover_keys_created_by_idx on public.sale_handover_keys(created_by);
create index if not exists sale_handover_keys_updated_by_idx on public.sale_handover_keys(updated_by);

-- ---------------------------------------------------------------------------
-- Fachliche Regeln
-- ---------------------------------------------------------------------------
create or replace function app_private.validate_property_reservation()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_status text;
begin
  select status into v_status from public.properties where id = new.property_id;
  if v_status is null then
    raise exception 'RESERVATION_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if not exists (select 1 from public.contacts c where c.id = new.contact_id) then
    raise exception 'RESERVATION_CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if tg_op = 'INSERT' and v_status in ('SOLD','LOST','WITHDRAWN','ARCHIVED') then
    raise exception 'RESERVATION_PROPERTY_NOT_RESERVABLE' using errcode = '22023';
  end if;
  if new.purchase_offer_id is not null and not exists (
    select 1 from public.purchase_offers o where o.id = new.purchase_offer_id and o.property_id = new.property_id
  ) then
    raise exception 'RESERVATION_OFFER_PROPERTY_MISMATCH' using errcode = '22023';
  end if;
  if new.purchase_offer_id is not null and not exists (
    select 1 from public.purchase_offers o where o.id = new.purchase_offer_id and o.contact_id = new.contact_id
  ) then
    raise exception 'RESERVATION_OFFER_CONTACT_MISMATCH' using errcode = '22023';
  end if;
  if new.ended_on is not null and new.ended_on > current_date then
    raise exception 'RESERVATION_END_DATE_IN_FUTURE' using errcode = '22023';
  end if;
  if new.ended_on is not null and new.ended_on < new.reserved_from then
    raise exception 'RESERVATION_END_BEFORE_START' using errcode = '22023';
  end if;
  if new.fee_amount is not null and not new.agreement_documented then
    raise exception 'RESERVATION_FEE_NEEDS_AGREEMENT' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and old.status <> 'ACTIVE' and new.status = 'ACTIVE' then
    raise exception 'RESERVATION_CANNOT_REACTIVATE' using errcode = '22023';
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_sale_closing_milestone()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_status text;
begin
  select status into v_status from public.sale_closings where id = new.sale_closing_id;
  if v_status is null then
    raise exception 'MILESTONE_CLOSING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if tg_op = 'UPDATE' and old.milestone_key is distinct from new.milestone_key then
    raise exception 'MILESTONE_KEY_IMMUTABLE' using errcode = '42501';
  end if;
  if new.initiated_on is not null and new.initiated_on > current_date then
    raise exception 'MILESTONE_INITIATED_IN_FUTURE' using errcode = '22023';
  end if;
  if new.completed_on is not null and new.completed_on > current_date then
    raise exception 'MILESTONE_COMPLETED_IN_FUTURE' using errcode = '22023';
  end if;
  -- Die Eigentumsumschreibung kann nicht vor der Beurkundung erfolgt sein.
  if new.milestone_key = 'TITLE_TRANSFER' and new.completed_on is not null then
    if exists (
      select 1 from public.sale_closings c
      where c.id = new.sale_closing_id
        and c.notarized_date is not null
        and new.completed_on < c.notarized_date
    ) then
      raise exception 'MILESTONE_TITLE_BEFORE_NOTARIZATION' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$function$;

-- Erst mit der Eigentumsumschreibung gilt der Fall als vollstaendig abgeschlossen.
-- Der Objektstatus SOLD bleibt davon unberuehrt; hier wird nur der Abschlussvorgang
-- selbst gebremst.
create or replace function app_private.enforce_closing_title_transfer()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if new.status = 'COMPLETED' and old.status is distinct from 'COMPLETED' then
    if not exists (
      select 1 from public.sale_closing_milestones m
      where m.sale_closing_id = new.id
        and m.milestone_key = 'TITLE_TRANSFER'
        and m.completed_on is not null
    ) then
      raise exception 'CLOSING_TITLE_TRANSFER_REQUIRED' using errcode = '22023';
    end if;
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_handover_protocol()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_status text;
begin
  select status into v_status from public.sale_closings where id = new.sale_closing_id;
  if v_status is null then
    raise exception 'HANDOVER_CLOSING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_status = 'CANCELLED' then
    raise exception 'HANDOVER_CLOSING_CANCELLED' using errcode = '22023';
  end if;
  if new.handover_at is not null and new.handover_at > now() then
    raise exception 'HANDOVER_DATE_IN_FUTURE' using errcode = '22023';
  end if;
  if (new.seller_confirmed_at is not null or new.buyer_confirmed_at is not null)
     and new.handover_at is null then
    raise exception 'HANDOVER_DATE_REQUIRED_BEFORE_CONFIRMATION' using errcode = '22023';
  end if;
  if new.document_id is not null and not exists (
    select 1 from public.documents d where d.id = new.document_id
  ) then
    raise exception 'HANDOVER_DOCUMENT_NOT_FOUND' using errcode = 'P0002';
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.property_reservations enable row level security;
alter table public.sale_closing_milestones enable row level security;
alter table public.sale_handover_protocols enable row level security;
alter table public.sale_handover_meters enable row level security;
alter table public.sale_handover_keys enable row level security;

drop policy if exists property_reservations_select on public.property_reservations;
create policy property_reservations_select on public.property_reservations for select to authenticated
using ((select app_private.has_permission('reservation.read')));

drop policy if exists property_reservations_insert on public.property_reservations;
create policy property_reservations_insert on public.property_reservations for insert to authenticated
with check ((select app_private.has_permission('reservation.write')) and created_by = (select auth.uid()));

drop policy if exists property_reservations_update on public.property_reservations;
create policy property_reservations_update on public.property_reservations for update to authenticated
using ((select app_private.has_permission('reservation.write')))
with check ((select app_private.has_permission('reservation.write')));

drop policy if exists sale_closing_milestones_select on public.sale_closing_milestones;
create policy sale_closing_milestones_select on public.sale_closing_milestones for select to authenticated
using ((select app_private.has_permission('closing.read')));

drop policy if exists sale_closing_milestones_insert on public.sale_closing_milestones;
create policy sale_closing_milestones_insert on public.sale_closing_milestones for insert to authenticated
with check ((select app_private.has_permission('closing.write')));

drop policy if exists sale_closing_milestones_update on public.sale_closing_milestones;
create policy sale_closing_milestones_update on public.sale_closing_milestones for update to authenticated
using ((select app_private.has_permission('closing.write')))
with check ((select app_private.has_permission('closing.write')));

drop policy if exists sale_handover_protocols_select on public.sale_handover_protocols;
create policy sale_handover_protocols_select on public.sale_handover_protocols for select to authenticated
using ((select app_private.has_permission('closing.read')));

drop policy if exists sale_handover_protocols_insert on public.sale_handover_protocols;
create policy sale_handover_protocols_insert on public.sale_handover_protocols for insert to authenticated
with check ((select app_private.has_permission('closing.write')) and created_by = (select auth.uid()));

drop policy if exists sale_handover_protocols_update on public.sale_handover_protocols;
create policy sale_handover_protocols_update on public.sale_handover_protocols for update to authenticated
using ((select app_private.has_permission('closing.write')))
with check ((select app_private.has_permission('closing.write')));

drop policy if exists sale_handover_meters_select on public.sale_handover_meters;
create policy sale_handover_meters_select on public.sale_handover_meters for select to authenticated
using ((select app_private.has_permission('closing.read')));

drop policy if exists sale_handover_meters_write on public.sale_handover_meters;
create policy sale_handover_meters_write on public.sale_handover_meters for all to authenticated
using ((select app_private.has_permission('closing.write')))
with check ((select app_private.has_permission('closing.write')));

drop policy if exists sale_handover_keys_select on public.sale_handover_keys;
create policy sale_handover_keys_select on public.sale_handover_keys for select to authenticated
using ((select app_private.has_permission('closing.read')));

drop policy if exists sale_handover_keys_write on public.sale_handover_keys;
create policy sale_handover_keys_write on public.sale_handover_keys for all to authenticated
using ((select app_private.has_permission('closing.write')))
with check ((select app_private.has_permission('closing.write')));

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
drop trigger if exists property_reservations_10_validate on public.property_reservations;
create trigger property_reservations_10_validate before insert or update on public.property_reservations
for each row execute function app_private.validate_property_reservation();

drop trigger if exists property_reservations_20_archive_guard on public.property_reservations;
create trigger property_reservations_20_archive_guard before update on public.property_reservations
for each row execute function app_private.enforce_archive_permission('reservation.archive');

drop trigger if exists property_reservations_90_metadata on public.property_reservations;
create trigger property_reservations_90_metadata before update on public.property_reservations
for each row execute function app_private.set_business_update_metadata();

drop trigger if exists property_reservations_audit on public.property_reservations;
create trigger property_reservations_audit after insert or update or delete on public.property_reservations
for each row execute function app_private.audit_row_change('RESERVATION','reservation_number');

drop trigger if exists sale_closing_milestones_10_validate on public.sale_closing_milestones;
create trigger sale_closing_milestones_10_validate before insert or update on public.sale_closing_milestones
for each row execute function app_private.validate_sale_closing_milestone();

drop trigger if exists sale_closing_milestones_40_metadata on public.sale_closing_milestones;
create trigger sale_closing_milestones_40_metadata before update on public.sale_closing_milestones
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists sale_closings_30_title_transfer_guard on public.sale_closings;
create trigger sale_closings_30_title_transfer_guard before update on public.sale_closings
for each row execute function app_private.enforce_closing_title_transfer();

drop trigger if exists sale_handover_protocols_10_validate on public.sale_handover_protocols;
create trigger sale_handover_protocols_10_validate before insert or update on public.sale_handover_protocols
for each row execute function app_private.validate_handover_protocol();

drop trigger if exists sale_handover_protocols_40_metadata on public.sale_handover_protocols;
create trigger sale_handover_protocols_40_metadata before update on public.sale_handover_protocols
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists sale_handover_meters_40_metadata on public.sale_handover_meters;
create trigger sale_handover_meters_40_metadata before update on public.sale_handover_meters
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists sale_handover_keys_40_metadata on public.sale_handover_keys;
create trigger sale_handover_keys_40_metadata before update on public.sale_handover_keys
for each row execute function app_private.set_standard_update_metadata();

grant select, insert, update on public.property_reservations to authenticated;
grant select, insert, update on public.sale_closing_milestones to authenticated;
grant select, insert, update on public.sale_handover_protocols to authenticated;
grant select, insert, update, delete on public.sale_handover_meters to authenticated;
grant select, insert, update, delete on public.sale_handover_keys to authenticated;
grant usage, select on sequence public.reservation_number_seq to authenticated;
