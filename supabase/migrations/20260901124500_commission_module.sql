-- Thema 1: Provisionen
-- Eigenständiges, aber an Immobilien/Kaufangebote/Kontakte angebundenes Provisionsmodul.

create sequence if not exists public.commission_number_seq;

create table if not exists public.commission_status_transitions (
  from_status text not null,
  to_status text not null,
  description text,
  primary key (from_status, to_status),
  constraint commission_status_transitions_from_check check (from_status in ('DRAFT','EXPECTED','DUE','INVOICED','PARTIALLY_PAID','PAID','CANCELLED')),
  constraint commission_status_transitions_to_check check (to_status in ('DRAFT','EXPECTED','DUE','INVOICED','PARTIALLY_PAID','PAID','CANCELLED'))
);

insert into public.commission_status_transitions(from_status,to_status,description) values
  ('DRAFT','EXPECTED','Vereinbarung vollständig erfassen und als erwartete Provision führen'),
  ('DRAFT','CANCELLED','Entwurf verwerfen'),
  ('EXPECTED','DRAFT','Zur weiteren Bearbeitung in den Entwurf zurücksetzen'),
  ('EXPECTED','DUE','Provision als fällig kennzeichnen'),
  ('EXPECTED','CANCELLED','Erwartete Provision stornieren'),
  ('DUE','EXPECTED','Fälligkeit zurücknehmen'),
  ('DUE','INVOICED','Rechnung als gestellt dokumentieren'),
  ('DUE','CANCELLED','Fällige Provision stornieren'),
  ('INVOICED','PARTIALLY_PAID','Teilzahlung dokumentieren'),
  ('INVOICED','PAID','Vollständige Zahlung dokumentieren'),
  ('INVOICED','CANCELLED','Gestellte Provision stornieren'),
  ('PARTIALLY_PAID','PAID','Restzahlung dokumentieren'),
  ('CANCELLED','DRAFT','Stornierten Vorgang erneut als Entwurf öffnen')
on conflict do nothing;

create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  commission_number text not null unique default ('ZM-P-' || lpad(nextval('public.commission_number_seq'::regclass)::text, 6, '0')),
  property_id uuid not null constraint commissions_property_id_fkey references public.properties(id),
  purchase_offer_id uuid constraint commissions_purchase_offer_id_fkey references public.purchase_offers(id),
  party_contact_id uuid constraint commissions_party_contact_id_fkey references public.contacts(id),
  side text not null default 'SELLER' check (side in ('SELLER','BUYER')),
  calculation_method text not null default 'PERCENT' check (calculation_method in ('PERCENT','FIXED')),
  calculation_basis numeric(14,2) check (calculation_basis is null or calculation_basis >= 0),
  agreed_percent numeric(7,4) check (agreed_percent is null or (agreed_percent > 0 and agreed_percent <= 100)),
  agreed_fixed_amount numeric(14,2) check (agreed_fixed_amount is null or agreed_fixed_amount > 0),
  expected_amount numeric(14,2) generated always as (
    case
      when calculation_method='PERCENT' and calculation_basis is not null and agreed_percent is not null
        then round(calculation_basis * agreed_percent / 100, 2)
      when calculation_method='FIXED' then agreed_fixed_amount
      else null
    end
  ) stored,
  actual_amount numeric(14,2) check (actual_amount is null or actual_amount >= 0),
  due_date date,
  invoice_reference text,
  invoice_status text not null default 'NOT_ISSUED' check (invoice_status in ('NOT_ISSUED','ISSUED','CANCELLED')),
  payment_status text not null default 'OPEN' check (payment_status in ('OPEN','PARTIALLY_PAID','PAID')),
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  paid_at date,
  status text not null default 'DRAFT' check (status in ('DRAFT','EXPECTED','DUE','INVOICED','PARTIALLY_PAID','PAID','CANCELLED')),
  primary_responsible_user uuid not null default auth.uid() constraint commissions_primary_responsible_user_fkey references public.profiles(user_id),
  internal_notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() constraint commissions_created_by_fkey references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() constraint commissions_updated_by_fkey references public.profiles(user_id),
  archived_at timestamptz,
  archived_by uuid constraint commissions_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),
  constraint commissions_method_values_check check (
    (calculation_method='PERCENT' and agreed_fixed_amount is null)
    or
    (calculation_method='FIXED' and agreed_percent is null)
  )
);

comment on table public.commissions is 'Provisionsforderungen je Immobilienverkauf. Eine Provision bildet genau eine zahlende Seite ab; SELLER entspricht Innenprovision, BUYER Außenprovision.';
comment on column public.commissions.purchase_offer_id is 'Optionaler Bezug zum vorhandenen Kaufangebot als aktuell verfügbarem Verkaufsvorgang.';
comment on column public.commissions.invoice_reference is 'Freie Referenz zu einer extern erstellten Rechnung; das CRM erzeugt keine Rechnung.';

create index if not exists commissions_property_idx on public.commissions(property_id) where archived_at is null;
create index if not exists commissions_status_idx on public.commissions(status) where archived_at is null;
create index if not exists commissions_due_idx on public.commissions(due_date) where archived_at is null and status not in ('PAID','CANCELLED');
create index if not exists commissions_party_idx on public.commissions(party_contact_id) where archived_at is null;

insert into public.permissions(key,description) values
  ('commission.read','Provisionen lesen'),
  ('commission.write','Provisionen bearbeiten'),
  ('commission.archive','Provisionen archivieren')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.key in ('commission.read','commission.write','commission.archive')
where r.key in ('admin','managing_director')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id
from public.roles r
join public.permissions p on p.key='commission.read'
where r.key='agent'
on conflict do nothing;

create or replace function app_private.validate_commission()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_transaction_type text;
  v_target numeric;
begin
  if tg_op='INSERT' and new.status <> 'DRAFT' then
    raise exception 'COMMISSION_MUST_START_DRAFT' using errcode='22023';
  end if;

  if tg_op='UPDATE' then
    if old.commission_number is distinct from new.commission_number then
      raise exception 'COMMISSION_NUMBER_IMMUTABLE' using errcode='42501';
    end if;

    if old.status is distinct from new.status and not exists(
      select 1 from public.commission_status_transitions t
      where t.from_status=old.status and t.to_status=new.status
    ) then
      raise exception 'INVALID_COMMISSION_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';
    end if;

    if old.archived_at is not null and new.archived_at is not null and row(
      new.property_id,new.purchase_offer_id,new.party_contact_id,new.side,new.calculation_method,
      new.calculation_basis,new.agreed_percent,new.agreed_fixed_amount,new.actual_amount,new.due_date,
      new.invoice_reference,new.paid_amount,new.paid_at,new.status,new.primary_responsible_user,new.internal_notes
    ) is distinct from row(
      old.property_id,old.purchase_offer_id,old.party_contact_id,old.side,old.calculation_method,
      old.calculation_basis,old.agreed_percent,old.agreed_fixed_amount,old.actual_amount,old.due_date,
      old.invoice_reference,old.paid_amount,old.paid_at,old.status,old.primary_responsible_user,old.internal_notes
    ) then
      raise exception 'ARCHIVED_COMMISSION_IMMUTABLE' using errcode='22023';
    end if;
  end if;

  select p.transaction_type into v_transaction_type from public.properties p where p.id=new.property_id;
  if v_transaction_type is null then raise exception 'COMMISSION_PROPERTY_NOT_FOUND' using errcode='P0002'; end if;
  if v_transaction_type <> 'SALE' then raise exception 'COMMISSION_SALE_PROPERTY_REQUIRED' using errcode='22023'; end if;

  if not exists(select 1 from public.profiles p where p.user_id=new.primary_responsible_user and p.status='ACTIVE') then
    raise exception 'COMMISSION_RESPONSIBLE_USER_INACTIVE' using errcode='22023';
  end if;

  if new.party_contact_id is not null and not exists(select 1 from public.contacts c where c.id=new.party_contact_id and c.archived_at is null) then
    raise exception 'COMMISSION_PARTY_NOT_AVAILABLE' using errcode='22023';
  end if;

  if new.purchase_offer_id is not null and not exists(
    select 1 from public.purchase_offers po
    where po.id=new.purchase_offer_id and po.property_id=new.property_id and po.archived_at is null
  ) then
    raise exception 'COMMISSION_OFFER_PROPERTY_MISMATCH' using errcode='22023';
  end if;

  if new.side='SELLER' and new.party_contact_id is not null and not exists(
    select 1 from public.property_owners po where po.property_id=new.property_id and po.contact_id=new.party_contact_id
  ) then
    raise exception 'COMMISSION_SELLER_MUST_BE_PROPERTY_OWNER' using errcode='22023';
  end if;

  if new.side='BUYER' and new.party_contact_id is not null and not exists(
    select 1 from public.purchase_offers po
    where po.property_id=new.property_id and po.contact_id=new.party_contact_id and po.archived_at is null
  ) then
    raise exception 'COMMISSION_BUYER_REQUIRES_PROPERTY_OFFER' using errcode='22023';
  end if;

  if new.side='BUYER' and new.purchase_offer_id is not null and new.party_contact_id is not null and not exists(
    select 1 from public.purchase_offers po where po.id=new.purchase_offer_id and po.contact_id=new.party_contact_id
  ) then
    raise exception 'COMMISSION_BUYER_OFFER_CONTACT_MISMATCH' using errcode='22023';
  end if;

  if new.status <> 'DRAFT' then
    if new.party_contact_id is null then raise exception 'COMMISSION_PARTY_REQUIRED' using errcode='22023'; end if;
    if new.calculation_method='PERCENT' and (coalesce(new.calculation_basis,0)<=0 or coalesce(new.agreed_percent,0)<=0) then
      raise exception 'COMMISSION_PERCENT_TERMS_REQUIRED' using errcode='22023';
    end if;
    if new.calculation_method='FIXED' and coalesce(new.agreed_fixed_amount,0)<=0 then
      raise exception 'COMMISSION_FIXED_AMOUNT_REQUIRED' using errcode='22023';
    end if;
  end if;

  v_target := coalesce(new.actual_amount,new.expected_amount);
  if new.status in ('DUE','INVOICED','PARTIALLY_PAID','PAID') then
    if new.due_date is null then raise exception 'COMMISSION_DUE_DATE_REQUIRED' using errcode='22023'; end if;
    if coalesce(v_target,0)<=0 then raise exception 'COMMISSION_TARGET_AMOUNT_REQUIRED' using errcode='22023'; end if;
  end if;

  if new.status in ('DRAFT','EXPECTED','DUE') then
    new.invoice_status := 'NOT_ISSUED';
    new.payment_status := 'OPEN';
    if new.paid_amount <> 0 or new.paid_at is not null then raise exception 'COMMISSION_PAYMENT_NOT_ALLOWED_YET' using errcode='22023'; end if;
  elsif new.status='INVOICED' then
    new.invoice_status := 'ISSUED';
    new.payment_status := 'OPEN';
    if new.paid_amount <> 0 or new.paid_at is not null then raise exception 'COMMISSION_INVOICED_PAYMENT_MUST_BE_OPEN' using errcode='22023'; end if;
  elsif new.status='PARTIALLY_PAID' then
    new.invoice_status := 'ISSUED';
    new.payment_status := 'PARTIALLY_PAID';
    if coalesce(new.paid_amount,0)<=0 or coalesce(v_target,0)<=new.paid_amount then
      raise exception 'COMMISSION_PARTIAL_PAYMENT_INVALID' using errcode='22023';
    end if;
    if new.paid_at is not null then raise exception 'COMMISSION_PAID_AT_ONLY_FOR_FULL_PAYMENT' using errcode='22023'; end if;
  elsif new.status='PAID' then
    new.invoice_status := 'ISSUED';
    new.payment_status := 'PAID';
    if coalesce(v_target,0)<=0 or new.paid_amount < v_target then raise exception 'COMMISSION_FULL_PAYMENT_INCOMPLETE' using errcode='22023'; end if;
    if new.paid_at is null then raise exception 'COMMISSION_PAID_AT_REQUIRED' using errcode='22023'; end if;
  elsif new.status='CANCELLED' then
    new.invoice_status := 'CANCELLED';
    new.payment_status := 'OPEN';
    if new.paid_amount <> 0 or new.paid_at is not null then raise exception 'PAID_COMMISSION_CANNOT_BE_CANCELLED' using errcode='22023'; end if;
  end if;

  return new;
end;
$function$;

alter table public.commissions enable row level security;
alter table public.commission_status_transitions enable row level security;

drop policy if exists commissions_select on public.commissions;
create policy commissions_select on public.commissions for select to authenticated
using (app_private.has_permission('commission.read'));

drop policy if exists commissions_insert on public.commissions;
create policy commissions_insert on public.commissions for insert to authenticated
with check (app_private.has_permission('commission.write') and created_by=auth.uid());

drop policy if exists commissions_update on public.commissions;
create policy commissions_update on public.commissions for update to authenticated
using (app_private.has_permission('commission.write'))
with check (app_private.has_permission('commission.write'));

drop policy if exists commission_status_transitions_select on public.commission_status_transitions;
create policy commission_status_transitions_select on public.commission_status_transitions for select to authenticated
using (app_private.has_permission('commission.read'));

drop trigger if exists commissions_10_validate on public.commissions;
create trigger commissions_10_validate before insert or update on public.commissions
for each row execute function app_private.validate_commission();

drop trigger if exists commissions_20_archive_guard on public.commissions;
create trigger commissions_20_archive_guard before update on public.commissions
for each row execute function app_private.enforce_archive_permission('commission.archive');

drop trigger if exists commissions_90_set_update_metadata on public.commissions;
create trigger commissions_90_set_update_metadata before update on public.commissions
for each row execute function app_private.set_business_update_metadata();

drop trigger if exists commissions_audit on public.commissions;
create trigger commissions_audit after insert or update or delete on public.commissions
for each row execute function app_private.audit_row_change('COMMISSION','commission_number');
