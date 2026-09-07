-- Thema 2: Kaufangebote, Abschluss & Notar
-- Baut auf dem bestehenden Kaufangebots- und Immobilienworkflow auf.

create sequence if not exists public.sale_closing_number_seq;

insert into public.permissions(key,description) values
  ('offer.accept','Kaufangebote verbindlich als angenommen dokumentieren'),
  ('closing.read','Abschluss- und Notarvorgänge lesen'),
  ('closing.write','Abschluss- und Notarvorgänge bearbeiten'),
  ('closing.cancel','Abschluss- und Notarvorgänge abbrechen'),
  ('closing.complete','Abschlussvorgänge als abgeschlossen dokumentieren'),
  ('closing.archive','Abschluss- und Notarvorgänge archivieren')
on conflict(key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('offer.accept','closing.read','closing.write','closing.cancel','closing.complete')
where r.key in ('admin','agent','managing_director')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('closing.read','closing.write')
where r.key='assistance'
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key='closing.archive'
where r.key in ('admin','managing_director')
on conflict do nothing;

alter table public.purchase_offers drop constraint if exists purchase_offers_status_check;
alter table public.purchase_offers add constraint purchase_offers_status_check
check(status in ('DRAFT','SUBMITTED','COUNTERED','ACCEPTED','REJECTED','WITHDRAWN','REPLACED','FAILED'));

insert into public.offer_status_transitions(from_status,to_status,description) values
  ('ACCEPTED','FAILED','Angenommener Abschluss ist nicht zustande gekommen')
on conflict do nothing;

create unique index if not exists purchase_offers_one_accepted_per_property_idx
on public.purchase_offers(property_id)
where archived_at is null and status='ACCEPTED';

create table if not exists public.sale_closing_status_transitions(
  from_status text not null,
  to_status text not null,
  description text,
  primary key(from_status,to_status),
  constraint sale_closing_status_transitions_from_check check(from_status in ('PREPARATION','NOTARY_INSTRUCTED','DRAFT_RECEIVED','APPOINTMENT_SCHEDULED','NOTARIZED','PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED','CANCELLED')),
  constraint sale_closing_status_transitions_to_check check(to_status in ('PREPARATION','NOTARY_INSTRUCTED','DRAFT_RECEIVED','APPOINTMENT_SCHEDULED','NOTARIZED','PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED','CANCELLED'))
);

insert into public.sale_closing_status_transitions(from_status,to_status,description) values
  ('PREPARATION','NOTARY_INSTRUCTED','Notariat beauftragt'),
  ('PREPARATION','CANCELLED','Abschlussvorbereitung abbrechen'),
  ('NOTARY_INSTRUCTED','PREPARATION','Notarbeauftragung zurücknehmen'),
  ('NOTARY_INSTRUCTED','DRAFT_RECEIVED','Kaufvertragsentwurf eingegangen'),
  ('NOTARY_INSTRUCTED','CANCELLED','Notarprozess abbrechen'),
  ('DRAFT_RECEIVED','NOTARY_INSTRUCTED','Entwurfseingang korrigieren'),
  ('DRAFT_RECEIVED','APPOINTMENT_SCHEDULED','Beurkundungstermin vereinbart'),
  ('DRAFT_RECEIVED','CANCELLED','Notarprozess abbrechen'),
  ('APPOINTMENT_SCHEDULED','DRAFT_RECEIVED','Terminstatus zurücknehmen'),
  ('APPOINTMENT_SCHEDULED','NOTARIZED','Beurkundung dokumentieren'),
  ('APPOINTMENT_SCHEDULED','CANCELLED','Termin/Abschluss abbrechen'),
  ('NOTARIZED','PURCHASE_PRICE_DUE','Kaufpreisfälligkeit dokumentieren'),
  ('PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','Kaufpreiszahlung dokumentieren'),
  ('PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','Übergabe dokumentieren'),
  ('HANDOVER_COMPLETED','COMPLETED','Verkauf abschließen')
on conflict do nothing;

create table if not exists public.sale_closings(
  id uuid primary key default gen_random_uuid(),
  closing_number text not null unique default ('ZM-VK-'||lpad(nextval('public.sale_closing_number_seq'::regclass)::text,6,'0')),
  property_id uuid not null constraint sale_closings_property_id_fkey references public.properties(id) on delete restrict,
  accepted_offer_id uuid not null unique constraint sale_closings_accepted_offer_id_fkey references public.purchase_offers(id) on delete restrict,
  buyer_contact_id uuid not null constraint sale_closings_buyer_contact_id_fkey references public.contacts(id) on delete restrict,
  agreed_purchase_price numeric(14,2) not null check(agreed_purchase_price>0),
  notarial_purchase_price numeric(14,2) check(notarial_purchase_price is null or notarial_purchase_price>0),
  status text not null default 'PREPARATION' check(status in ('PREPARATION','NOTARY_INSTRUCTED','DRAFT_RECEIVED','APPOINTMENT_SCHEDULED','NOTARIZED','PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED','CANCELLED')),
  notary_organization_id uuid constraint sale_closings_notary_organization_id_fkey references public.organizations(id) on delete set null,
  notary_contact_id uuid constraint sale_closings_notary_contact_id_fkey references public.contacts(id) on delete set null,
  notary_reference text,
  notary_instruction_date date,
  draft_received_date date,
  notary_appointment_at timestamptz,
  notarized_date date,
  purchase_price_due_date date,
  purchase_price_paid_date date,
  handover_date date,
  completed_date date,
  cancellation_reason text,
  primary_responsible_user uuid not null default auth.uid() constraint sale_closings_primary_responsible_user_fkey references public.profiles(user_id),
  internal_notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() constraint sale_closings_created_by_fkey references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() constraint sale_closings_updated_by_fkey references public.profiles(user_id),
  archived_at timestamptz,
  archived_by uuid constraint sale_closings_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check(version>0)
);

comment on table public.sale_closings is 'Kontrollierter Verkaufsabschluss ab angenommenem Kaufangebot bis Notar, Kaufpreiszahlung und Übergabe. Der Datensatz bildet Prozessfortschritt ab und ersetzt keine rechtliche Prüfung.';
comment on column public.sale_closings.notarial_purchase_price is 'Optional dokumentierter Kaufpreis aus der notariellen Urkunde, falls er vom angenommenen Angebot abweicht.';
comment on column public.sale_closings.notary_reference is 'Externes Aktenzeichen oder freie Referenz des Notariats.';

create index if not exists sale_closings_property_idx on public.sale_closings(property_id,status) where archived_at is null;
create index if not exists sale_closings_buyer_idx on public.sale_closings(buyer_contact_id) where archived_at is null;
create index if not exists sale_closings_notary_org_idx on public.sale_closings(notary_organization_id) where notary_organization_id is not null;
create index if not exists sale_closings_notary_contact_idx on public.sale_closings(notary_contact_id) where notary_contact_id is not null;
create index if not exists sale_closings_responsible_idx on public.sale_closings(primary_responsible_user,status) where archived_at is null;
create index if not exists sale_closings_created_by_idx on public.sale_closings(created_by);
create index if not exists sale_closings_updated_by_idx on public.sale_closings(updated_by);
create index if not exists sale_closings_archived_by_idx on public.sale_closings(archived_by) where archived_by is not null;
create index if not exists sale_closings_appointment_idx on public.sale_closings(notary_appointment_at) where archived_at is null and notary_appointment_at is not null;
create unique index if not exists sale_closings_one_active_per_property_idx
on public.sale_closings(property_id)
where archived_at is null and status<>'CANCELLED';

alter table public.sale_closings enable row level security;
alter table public.sale_closing_status_transitions enable row level security;

drop policy if exists sale_closings_select on public.sale_closings;
create policy sale_closings_select on public.sale_closings for select to authenticated
using(app_private.has_permission('closing.read'));

drop policy if exists sale_closings_insert on public.sale_closings;
create policy sale_closings_insert on public.sale_closings for insert to authenticated
with check(app_private.has_permission('closing.write') and created_by=(select auth.uid()));

drop policy if exists sale_closings_update on public.sale_closings;
create policy sale_closings_update on public.sale_closings for update to authenticated
using(app_private.has_permission('closing.write'))
with check(app_private.has_permission('closing.write'));

drop policy if exists sale_closing_status_transitions_select on public.sale_closing_status_transitions;
create policy sale_closing_status_transitions_select on public.sale_closing_status_transitions for select to authenticated
using(app_private.has_permission('closing.read'));

grant select,insert,update on public.sale_closings to authenticated;
grant select on public.sale_closing_status_transitions to authenticated;
grant usage,select on sequence public.sale_closing_number_seq to authenticated;

create or replace function app_private.validate_sale_closing()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_offer public.purchase_offers%rowtype;
begin
  if tg_op='INSERT' and new.status<>'PREPARATION' then
    raise exception 'CLOSING_MUST_START_PREPARATION' using errcode='22023';
  end if;

  select * into v_offer from public.purchase_offers po where po.id=new.accepted_offer_id;
  if not found then raise exception 'CLOSING_ACCEPTED_OFFER_NOT_FOUND' using errcode='P0002'; end if;
  if v_offer.status<>'ACCEPTED' then raise exception 'CLOSING_REQUIRES_ACCEPTED_OFFER' using errcode='22023'; end if;
  if v_offer.property_id<>new.property_id or v_offer.contact_id<>new.buyer_contact_id then
    raise exception 'CLOSING_OFFER_CONTEXT_MISMATCH' using errcode='22023';
  end if;
  if v_offer.amount<>new.agreed_purchase_price then
    raise exception 'CLOSING_AGREED_PRICE_MUST_MATCH_OFFER' using errcode='22023';
  end if;
  if not exists(select 1 from public.properties p where p.id=new.property_id and p.transaction_type='SALE') then
    raise exception 'CLOSING_SALE_PROPERTY_REQUIRED' using errcode='22023';
  end if;
  if not exists(select 1 from public.contacts c where c.id=new.buyer_contact_id and c.archived_at is null) then
    raise exception 'CLOSING_BUYER_NOT_AVAILABLE' using errcode='22023';
  end if;
  if not exists(select 1 from public.profiles p where p.user_id=new.primary_responsible_user and p.status='ACTIVE') then
    raise exception 'CLOSING_RESPONSIBLE_USER_INACTIVE' using errcode='22023';
  end if;
  if new.notary_organization_id is not null and not exists(select 1 from public.organizations o where o.id=new.notary_organization_id and o.archived_at is null) then
    raise exception 'CLOSING_NOTARY_ORGANIZATION_NOT_AVAILABLE' using errcode='22023';
  end if;
  if new.notary_contact_id is not null and not exists(select 1 from public.contacts c where c.id=new.notary_contact_id and c.archived_at is null) then
    raise exception 'CLOSING_NOTARY_CONTACT_NOT_AVAILABLE' using errcode='22023';
  end if;

  if tg_op='UPDATE' then
    if old.closing_number is distinct from new.closing_number then raise exception 'CLOSING_NUMBER_IMMUTABLE' using errcode='42501'; end if;
    if row(old.property_id,old.accepted_offer_id,old.buyer_contact_id,old.agreed_purchase_price) is distinct from row(new.property_id,new.accepted_offer_id,new.buyer_contact_id,new.agreed_purchase_price) then
      raise exception 'CLOSING_SOURCE_IMMUTABLE' using errcode='22023';
    end if;
    if old.status is distinct from new.status and not exists(
      select 1 from public.sale_closing_status_transitions t where t.from_status=old.status and t.to_status=new.status
    ) then
      raise exception 'INVALID_CLOSING_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';
    end if;
    if old.archived_at is not null and new.archived_at is not null and row(
      new.notarial_purchase_price,new.status,new.notary_organization_id,new.notary_contact_id,new.notary_reference,
      new.notary_instruction_date,new.draft_received_date,new.notary_appointment_at,new.notarized_date,
      new.purchase_price_due_date,new.purchase_price_paid_date,new.handover_date,new.completed_date,
      new.cancellation_reason,new.primary_responsible_user,new.internal_notes
    ) is distinct from row(
      old.notarial_purchase_price,old.status,old.notary_organization_id,old.notary_contact_id,old.notary_reference,
      old.notary_instruction_date,old.draft_received_date,old.notary_appointment_at,old.notarized_date,
      old.purchase_price_due_date,old.purchase_price_paid_date,old.handover_date,old.completed_date,
      old.cancellation_reason,old.primary_responsible_user,old.internal_notes
    ) then
      raise exception 'ARCHIVED_CLOSING_IMMUTABLE' using errcode='22023';
    end if;
    if old.archived_at is distinct from new.archived_at and new.archived_at is not null and new.status not in ('COMPLETED','CANCELLED') then
      raise exception 'CLOSING_ONLY_TERMINAL_ARCHIVABLE' using errcode='22023';
    end if;
  end if;

  if new.status in ('NOTARY_INSTRUCTED','DRAFT_RECEIVED','APPOINTMENT_SCHEDULED','NOTARIZED','PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED') then
    if new.notary_organization_id is null and new.notary_contact_id is null then raise exception 'CLOSING_NOTARY_REQUIRED' using errcode='22023'; end if;
    if new.notary_instruction_date is null then raise exception 'CLOSING_NOTARY_INSTRUCTION_DATE_REQUIRED' using errcode='22023'; end if;
  end if;
  if new.status in ('DRAFT_RECEIVED','APPOINTMENT_SCHEDULED','NOTARIZED','PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED') and new.draft_received_date is null then
    raise exception 'CLOSING_DRAFT_RECEIVED_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status in ('APPOINTMENT_SCHEDULED','NOTARIZED','PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED') and new.notary_appointment_at is null then
    raise exception 'CLOSING_NOTARY_APPOINTMENT_REQUIRED' using errcode='22023';
  end if;
  if new.status in ('NOTARIZED','PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED') and new.notarized_date is null then
    raise exception 'CLOSING_NOTARIZED_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status in ('PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED') and new.purchase_price_due_date is null then
    raise exception 'CLOSING_PURCHASE_PRICE_DUE_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status in ('PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED') and new.purchase_price_paid_date is null then
    raise exception 'CLOSING_PURCHASE_PRICE_PAID_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status in ('HANDOVER_COMPLETED','COMPLETED') and new.handover_date is null then
    raise exception 'CLOSING_HANDOVER_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status='COMPLETED' and new.completed_date is null then
    raise exception 'CLOSING_COMPLETED_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status='CANCELLED' and nullif(trim(coalesce(new.cancellation_reason,'')),'') is null then
    raise exception 'CLOSING_CANCELLATION_REASON_REQUIRED' using errcode='22023';
  end if;

  return new;
end;
$function$;
revoke all on function app_private.validate_sale_closing() from public;

create or replace function app_private.enforce_sale_closing_sensitive_permissions()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if tg_op='UPDATE' and old.status is distinct from new.status then
    if new.status='CANCELLED' and not app_private.has_permission('closing.cancel') then
      raise exception 'CLOSING_CANCEL_REQUIRED' using errcode='42501';
    end if;
    if new.status='COMPLETED' and not app_private.has_permission('closing.complete') then
      raise exception 'CLOSING_COMPLETE_REQUIRED' using errcode='42501';
    end if;
  end if;
  if tg_op='UPDATE' and old.archived_at is distinct from new.archived_at and not app_private.has_permission('closing.archive') then
    raise exception 'CLOSING_ARCHIVE_REQUIRED' using errcode='42501';
  end if;
  return new;
end;
$function$;
revoke all on function app_private.enforce_sale_closing_sensitive_permissions() from public;

create or replace function app_private.validate_purchase_offer()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_previous uuid;
  v_property_status text;
  v_transaction_type text;
begin
  if tg_op='UPDATE' and old.status is distinct from new.status and not exists(
    select 1 from public.offer_status_transitions t where t.from_status=old.status and t.to_status=new.status
  ) then
    raise exception 'INVALID_OFFER_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';
  end if;

  if tg_op='UPDATE' and old.status<>'DRAFT' and row(new.amount,new.financing_status,new.valid_until,new.notes,new.property_id,new.contact_id,new.search_profile_id,new.inquiry_id,new.viewing_id) is distinct from row(old.amount,old.financing_status,old.valid_until,old.notes,old.property_id,old.contact_id,old.search_profile_id,old.inquiry_id,old.viewing_id) then
    raise exception 'SUBMITTED_OFFER_IMMUTABLE_CREATE_FOLLOWUP' using errcode='22023';
  end if;

  if new.search_profile_id is not null and not exists(select 1 from public.search_profiles sp where sp.id=new.search_profile_id and sp.contact_id=new.contact_id) then raise exception 'OFFER_SEARCH_PROFILE_CONTACT_MISMATCH' using errcode='22023'; end if;
  if new.inquiry_id is not null and not exists(select 1 from public.inquiries i where i.id=new.inquiry_id and i.contact_id=new.contact_id) then raise exception 'OFFER_INQUIRY_CONTACT_MISMATCH' using errcode='22023'; end if;
  if new.viewing_id is not null and not exists(select 1 from public.viewings v where v.id=new.viewing_id and v.contact_id=new.contact_id and v.property_id=new.property_id) then raise exception 'OFFER_VIEWING_MISMATCH' using errcode='22023'; end if;

  if new.status='ACCEPTED' and (tg_op='INSERT' or old.status is distinct from new.status) then
    if not app_private.has_permission('offer.accept') then raise exception 'OFFER_ACCEPT_REQUIRED' using errcode='42501'; end if;
    select p.status,p.transaction_type into v_property_status,v_transaction_type from public.properties p where p.id=new.property_id;
    if v_transaction_type<>'SALE' then raise exception 'OFFER_ACCEPT_SALE_PROPERTY_REQUIRED' using errcode='22023'; end if;
    if v_property_status not in ('MARKETING','RESERVED') then raise exception 'OFFER_ACCEPT_PROPERTY_NOT_MARKETABLE:%',coalesce(v_property_status,'UNKNOWN') using errcode='22023'; end if;
    if exists(select 1 from public.purchase_offers po where po.property_id=new.property_id and po.id<>new.id and po.archived_at is null and po.status='ACCEPTED') then
      raise exception 'ACCEPTED_OFFER_ALREADY_EXISTS_FOR_PROPERTY' using errcode='22023';
    end if;
  end if;

  if tg_op='UPDATE' and old.status='ACCEPTED' and new.status='FAILED' and exists(
    select 1 from public.sale_closings sc where sc.accepted_offer_id=new.id and sc.archived_at is null and sc.status<>'CANCELLED'
  ) then
    raise exception 'CLOSING_MUST_BE_CANCELLED_FIRST' using errcode='22023';
  end if;

  if new.status='SUBMITTED' and (tg_op='INSERT' or old.status is distinct from new.status) then
    if exists(select 1 from public.purchase_offers po where po.property_id=new.property_id and po.contact_id=new.contact_id and po.id<>new.id and po.archived_at is null and po.status='ACCEPTED') then raise exception 'ACCEPTED_OFFER_ALREADY_EXISTS' using errcode='22023';end if;
    select po.id into v_previous from public.purchase_offers po where po.property_id=new.property_id and po.contact_id=new.contact_id and po.id<>new.id and po.archived_at is null and po.status in ('SUBMITTED','COUNTERED') order by po.submitted_at desc nulls last,po.created_at desc limit 1;
    if v_previous is not null then
      update public.purchase_offers set status='REPLACED',replaced_by_offer_id=new.id where id=v_previous;
      if new.supersedes_offer_id is null then new.supersedes_offer_id:=v_previous;end if;
    end if;
    if new.submitted_at is null then new.submitted_at:=now();end if;
  end if;

  return new;
end;
$function$;
revoke all on function app_private.validate_purchase_offer() from public;

create or replace function app_private.initialize_closing_from_accepted_offer()
returns trigger
language plpgsql
security definer
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if new.status='ACCEPTED' and (tg_op='INSERT' or old.status is distinct from new.status) then
    insert into public.sale_closings(
      property_id,accepted_offer_id,buyer_contact_id,agreed_purchase_price,primary_responsible_user,created_by,updated_by
    ) values(
      new.property_id,new.id,new.contact_id,new.amount,coalesce(new.primary_responsible_user,auth.uid()),auth.uid(),auth.uid()
    ) on conflict(accepted_offer_id) do nothing;

    update public.properties p set status='RESERVED'
    where p.id=new.property_id and p.status='MARKETING';
  end if;
  return new;
end;
$function$;
revoke all on function app_private.initialize_closing_from_accepted_offer() from public;

create or replace function app_private.sync_sale_closing_workflow()
returns trigger
language plpgsql
security definer
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_property_status text;
begin
  if old.status is not distinct from new.status then return new; end if;

  if new.status in ('NOTARY_INSTRUCTED','DRAFT_RECEIVED','APPOINTMENT_SCHEDULED','NOTARIZED','PURCHASE_PRICE_DUE','PURCHASE_PRICE_PAID','HANDOVER_COMPLETED','COMPLETED') then
    select p.status into v_property_status from public.properties p where p.id=new.property_id for update;
    if v_property_status in ('MARKETING','RESERVED') then
      update public.properties set status='NOTARY' where id=new.property_id;
    end if;
  end if;

  if new.status='CANCELLED' then
    update public.purchase_offers set status='FAILED'
    where id=new.accepted_offer_id and status='ACCEPTED';

    select p.status into v_property_status from public.properties p where p.id=new.property_id for update;
    if v_property_status in ('RESERVED','NOTARY') then
      update public.properties set status='MARKETING' where id=new.property_id;
    end if;
  elsif new.status='COMPLETED' then
    select p.status into v_property_status from public.properties p where p.id=new.property_id for update;
    if v_property_status<>'NOTARY' then
      raise exception 'CLOSING_PROPERTY_MUST_BE_NOTARY_BEFORE_SOLD' using errcode='22023';
    end if;
    update public.properties set status='SOLD' where id=new.property_id;
  end if;

  return new;
end;
$function$;
revoke all on function app_private.sync_sale_closing_workflow() from public;

-- Triggerreihenfolge: erst Berechtigungen und Fachvalidierung, dann Metadaten; Workflow-Synchronisation nach erfolgreichem Update.
drop trigger if exists sale_closings_10_sensitive_permissions on public.sale_closings;
create trigger sale_closings_10_sensitive_permissions before update on public.sale_closings
for each row execute function app_private.enforce_sale_closing_sensitive_permissions();

drop trigger if exists sale_closings_20_validate on public.sale_closings;
create trigger sale_closings_20_validate before insert or update on public.sale_closings
for each row execute function app_private.validate_sale_closing();

drop trigger if exists sale_closings_90_set_update_metadata on public.sale_closings;
create trigger sale_closings_90_set_update_metadata before update on public.sale_closings
for each row execute function app_private.set_business_update_metadata();

drop trigger if exists sale_closings_95_sync_workflow on public.sale_closings;
create trigger sale_closings_95_sync_workflow after update on public.sale_closings
for each row execute function app_private.sync_sale_closing_workflow();

drop trigger if exists sale_closings_audit on public.sale_closings;
create trigger sale_closings_audit after insert or update or delete on public.sale_closings
for each row execute function app_private.audit_row_change('CLOSING','closing_number');

drop trigger if exists purchase_offers_20_validate on public.purchase_offers;
create trigger purchase_offers_20_validate before insert or update on public.purchase_offers
for each row execute function app_private.validate_purchase_offer();

drop trigger if exists purchase_offers_95_initialize_closing on public.purchase_offers;
create trigger purchase_offers_95_initialize_closing after insert or update on public.purchase_offers
for each row execute function app_private.initialize_closing_from_accepted_offer();

-- Bestehende angenommene BETA-Angebote erhalten ohne Statusänderung eine Abschlussakte.
insert into public.sale_closings(
  property_id,accepted_offer_id,buyer_contact_id,agreed_purchase_price,primary_responsible_user,created_at,created_by,updated_at,updated_by
)
select po.property_id,po.id,po.contact_id,po.amount,
       coalesce(po.primary_responsible_user,po.updated_by,po.created_by),
       po.updated_at,coalesce(po.updated_by,po.created_by),po.updated_at,coalesce(po.updated_by,po.created_by)
from public.purchase_offers po
where po.status='ACCEPTED' and po.archived_at is null
  and coalesce(po.primary_responsible_user,po.updated_by,po.created_by) is not null
  and not exists(select 1 from public.sale_closings sc where sc.accepted_offer_id=po.id)
on conflict do nothing;
