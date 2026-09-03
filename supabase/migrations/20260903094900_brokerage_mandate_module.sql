-- Thema 1 (Maklerpraxis): Maklerauftrag, Provisionsvereinbarung und Widerruf
-- Der Maklerauftrag wird ein eigener Vorgang. Das System erfasst Sachverhalte,
-- Fristen und Nachweise; es bewertet nichts rechtlich und erzeugt keine Rechtstexte.

create sequence if not exists public.brokerage_mandate_number_seq;

-- ---------------------------------------------------------------- Statusmaschine

create table if not exists public.brokerage_mandate_status_transitions (
  from_status text not null,
  to_status text not null,
  description text,
  primary key (from_status, to_status),
  constraint brokerage_mandate_transitions_from_check check (from_status in ('DRAFT','ACTIVE','WITHDRAWN','TERMINATED','EXPIRED','FULFILLED','CANCELLED')),
  constraint brokerage_mandate_transitions_to_check check (to_status in ('DRAFT','ACTIVE','WITHDRAWN','TERMINATED','EXPIRED','FULFILLED','CANCELLED'))
);

insert into public.brokerage_mandate_status_transitions(from_status,to_status,description) values
  ('DRAFT','ACTIVE','Auftrag als zustande gekommen führen'),
  ('DRAFT','CANCELLED','Entwurf verwerfen'),
  ('ACTIVE','WITHDRAWN','Widerruf des Auftraggebers dokumentieren'),
  ('ACTIVE','TERMINATED','Kündigung dokumentieren'),
  ('ACTIVE','EXPIRED','Laufzeit ist abgelaufen'),
  ('ACTIVE','FULFILLED','Auftrag durch Verkauf erfüllt'),
  ('EXPIRED','ACTIVE','Verlängerung dokumentieren'),
  ('CANCELLED','DRAFT','Verworfenen Entwurf erneut öffnen')
on conflict do nothing;

-- ---------------------------------------------------------------- Auftrag

create table if not exists public.brokerage_mandates (
  id uuid primary key default gen_random_uuid(),
  mandate_number text not null unique default ('ZM-MA-' || lpad(nextval('public.brokerage_mandate_number_seq'::regclass)::text, 6, '0')),
  property_id uuid not null constraint brokerage_mandates_property_id_fkey references public.properties(id),
  lead_id uuid constraint brokerage_mandates_lead_id_fkey references public.leads(id),
  mandate_type text not null default 'SIMPLE' check (mandate_type in ('SIMPLE','EXCLUSIVE','QUALIFIED_EXCLUSIVE')),
  client_side text not null default 'SELLER' check (client_side in ('SELLER','BUYER','BOTH')),
  dual_agency boolean generated always as (client_side = 'BOTH') stored,
  client_is_consumer boolean not null default true,
  concluded_on date,
  conclusion_channel text check (conclusion_channel is null or conclusion_channel in ('IN_PERSON','POSTAL','EMAIL','WEB_FORM','PHONE','OTHER')),
  text_form_confirmed boolean not null default false,
  term_start date,
  term_end date,
  renewal_mode text not null default 'NONE' check (renewal_mode in ('NONE','AUTOMATIC')),
  renewal_months integer check (renewal_months is null or (renewal_months >= 1 and renewal_months <= 24)),
  notice_period_days integer check (notice_period_days is null or (notice_period_days >= 0 and notice_period_days <= 365)),
  terminated_on date,
  termination_reason text,
  actual_end_on date,
  client_share_payment_proof_on date,
  client_share_payment_proof_note text,
  withdrawal_instruction_given_on date,
  withdrawal_instruction_form text check (withdrawal_instruction_form is null or withdrawal_instruction_form in ('TEXT_FORM','WRITTEN','HANDED_OVER','EMAIL','OTHER')),
  withdrawal_instruction_evidence text,
  withdrawal_deadline_on date,
  early_start_requested_on date,
  early_start_value_compensation_ack boolean not null default false,
  withdrawn_on date,
  status text not null default 'DRAFT' check (status in ('DRAFT','ACTIVE','WITHDRAWN','TERMINATED','EXPIRED','FULFILLED','CANCELLED')),
  primary_responsible_user uuid not null default auth.uid() constraint brokerage_mandates_primary_responsible_user_fkey references public.profiles(user_id),
  internal_notes text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() constraint brokerage_mandates_created_by_fkey references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() constraint brokerage_mandates_updated_by_fkey references public.profiles(user_id),
  archived_at timestamptz,
  archived_by uuid constraint brokerage_mandates_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),
  constraint brokerage_mandates_term_range_check check (term_end is null or term_start is null or term_end >= term_start),
  constraint brokerage_mandates_withdrawal_range_check check (
    withdrawal_deadline_on is null or withdrawal_instruction_given_on is null or withdrawal_deadline_on >= withdrawal_instruction_given_on
  ),
  constraint brokerage_mandates_renewal_check check (renewal_mode <> 'AUTOMATIC' or renewal_months is not null)
);

comment on table public.brokerage_mandates is 'Maklerauftrag als eigener Vorgang. Erfasst Auftragsart, Laufzeit, Form, Provisionsvereinbarung und Widerrufsdokumentation. Keine rechtliche Bewertung durch das System.';
comment on column public.brokerage_mandates.text_form_confirmed is 'Dokumentiert, dass der Auftrag in Textform vorliegt. Reine Erfassung, keine Wirksamkeitsprüfung.';
comment on column public.brokerage_mandates.withdrawal_deadline_on is 'Vom Benutzer gesetztes Fristende. Das System berechnet die Frist nicht selbst.';
comment on column public.brokerage_mandates.client_share_payment_proof_on is 'Nachweis, dass der Auftraggeberanteil der Provision gezahlt wurde.';

create index if not exists brokerage_mandates_property_idx on public.brokerage_mandates(property_id) where archived_at is null;
create index if not exists brokerage_mandates_lead_idx on public.brokerage_mandates(lead_id) where archived_at is null;
create index if not exists brokerage_mandates_status_idx on public.brokerage_mandates(status) where archived_at is null;
create index if not exists brokerage_mandates_responsible_idx on public.brokerage_mandates(primary_responsible_user);
create index if not exists brokerage_mandates_created_by_idx on public.brokerage_mandates(created_by);
create index if not exists brokerage_mandates_updated_by_idx on public.brokerage_mandates(updated_by);
create index if not exists brokerage_mandates_archived_by_idx on public.brokerage_mandates(archived_by);
create unique index if not exists brokerage_mandates_one_active_per_property_idx
  on public.brokerage_mandates(property_id) where archived_at is null and status = 'ACTIVE';

-- ---------------------------------------------------------------- Auftraggeber

create table if not exists public.brokerage_mandate_clients (
  id uuid primary key default gen_random_uuid(),
  mandate_id uuid not null constraint brokerage_mandate_clients_mandate_id_fkey references public.brokerage_mandates(id) on delete cascade,
  contact_id uuid not null constraint brokerage_mandate_clients_contact_id_fkey references public.contacts(id),
  signed_on date,
  note text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() constraint brokerage_mandate_clients_created_by_fkey references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() constraint brokerage_mandate_clients_updated_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),
  unique (mandate_id, contact_id)
);

create index if not exists brokerage_mandate_clients_contact_idx on public.brokerage_mandate_clients(contact_id);
create index if not exists brokerage_mandate_clients_created_by_idx on public.brokerage_mandate_clients(created_by);
create index if not exists brokerage_mandate_clients_updated_by_idx on public.brokerage_mandate_clients(updated_by);

-- ---------------------------------------------------------------- Provisionsvereinbarung je Seite

create table if not exists public.brokerage_mandate_commission_terms (
  id uuid primary key default gen_random_uuid(),
  mandate_id uuid not null constraint brokerage_mandate_terms_mandate_id_fkey references public.brokerage_mandates(id) on delete cascade,
  side text not null check (side in ('SELLER','BUYER')),
  calculation_method text not null default 'PERCENT' check (calculation_method in ('PERCENT','FIXED')),
  agreed_percent numeric(7,4) check (agreed_percent is null or (agreed_percent > 0 and agreed_percent <= 100)),
  agreed_fixed_amount numeric(14,2) check (agreed_fixed_amount is null or agreed_fixed_amount > 0),
  calculation_basis_kind text not null default 'PURCHASE_PRICE' check (calculation_basis_kind in ('PURCHASE_PRICE','NOTARIAL_PURCHASE_PRICE','OTHER')),
  calculation_basis_note text,
  due_event text not null default 'NOTARIZATION' check (due_event in ('CONTRACT_CONCLUSION','NOTARIZATION','PURCHASE_PRICE_PAID','HANDOVER','OTHER')),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid not null default auth.uid() constraint brokerage_mandate_terms_created_by_fkey references public.profiles(user_id),
  updated_at timestamptz not null default now(),
  updated_by uuid not null default auth.uid() constraint brokerage_mandate_terms_updated_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),
  unique (mandate_id, side),
  constraint brokerage_mandate_terms_method_values_check check (
    (calculation_method='PERCENT' and agreed_percent is not null and agreed_fixed_amount is null)
    or
    (calculation_method='FIXED' and agreed_fixed_amount is not null and agreed_percent is null)
  )
);

comment on table public.brokerage_mandate_commission_terms is 'Vereinbarte Provision je Seite. Verkäufer- und Käuferseite werden getrennt geführt; das System prüft die vereinbarten Höhen gegeneinander.';

create index if not exists brokerage_mandate_terms_created_by_idx on public.brokerage_mandate_commission_terms(created_by);
create index if not exists brokerage_mandate_terms_updated_by_idx on public.brokerage_mandate_commission_terms(updated_by);

-- ---------------------------------------------------------------- Anbindung Provision und Aufgabe

alter table public.commissions
  add column if not exists mandate_id uuid constraint commissions_mandate_id_fkey references public.brokerage_mandates(id);
create index if not exists commissions_mandate_idx on public.commissions(mandate_id) where archived_at is null;

alter table public.tasks
  add column if not exists mandate_id uuid constraint tasks_mandate_id_fkey references public.brokerage_mandates(id);
create index if not exists tasks_mandate_idx on public.tasks(mandate_id) where archived_at is null;
create unique index if not exists tasks_mandate_title_unique_idx
  on public.tasks(mandate_id, title) where mandate_id is not null and archived_at is null;

-- ---------------------------------------------------------------- Berechtigungen

insert into public.permissions(key,description) values
  ('mandate.read','Makleraufträge lesen'),
  ('mandate.write','Makleraufträge bearbeiten'),
  ('mandate.archive','Makleraufträge archivieren')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('mandate.read','mandate.write','mandate.archive')
where r.key in ('admin','managing_director')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key='mandate.read'
where r.key='agent'
on conflict do nothing;

-- ---------------------------------------------------------------- Fachliche Prüfung Provisionsvereinbarung

create or replace function app_private.brokerage_term_value(p_method text, p_percent numeric, p_fixed numeric)
returns numeric
language sql
immutable
set search_path to ''
as $function$
  select case when p_method='PERCENT' then p_percent else p_fixed end;
$function$;

revoke all on function app_private.brokerage_term_value(text,numeric,numeric) from public;

create or replace function app_private.validate_brokerage_mandate_terms()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_mandate public.brokerage_mandates%rowtype;
  v_seller public.brokerage_mandate_commission_terms%rowtype;
  v_buyer public.brokerage_mandate_commission_terms%rowtype;
  v_mandate_id uuid;
begin
  if tg_op='DELETE' then
    v_mandate_id := old.mandate_id;
  else
    v_mandate_id := new.mandate_id;
  end if;

  select * into v_mandate from public.brokerage_mandates where id=v_mandate_id;
  if v_mandate.id is null then
    -- Der Auftrag wurde mitgelöscht; für die Kinder ist dann nichts mehr zu prüfen.
    if tg_op='DELETE' then return old; end if;
    raise exception 'MANDATE_NOT_FOUND' using errcode='P0002';
  end if;
  if v_mandate.archived_at is not null then
    raise exception 'ARCHIVED_MANDATE_IMMUTABLE' using errcode='22023';
  end if;

  if tg_op <> 'DELETE' then
    if v_mandate.client_side='SELLER' and new.side='BUYER' and not exists(
      select 1 from public.brokerage_mandate_commission_terms t
      where t.mandate_id=v_mandate_id and t.side='SELLER'
    ) then
      raise exception 'MANDATE_BUYER_TERM_REQUIRES_SELLER_TERM' using errcode='22023';
    end if;
    if v_mandate.client_side='BUYER' and new.side='SELLER' then
      raise exception 'MANDATE_SELLER_TERM_NOT_ALLOWED_FOR_BUYER_MANDATE' using errcode='22023';
    end if;
  end if;

  select * into v_seller from public.brokerage_mandate_commission_terms where mandate_id=v_mandate_id and side='SELLER';
  select * into v_buyer from public.brokerage_mandate_commission_terms where mandate_id=v_mandate_id and side='BUYER';

  if v_seller.id is not null and v_buyer.id is not null then
    if v_mandate.client_side='BOTH' then
      if v_seller.calculation_method is distinct from v_buyer.calculation_method
         or app_private.brokerage_term_value(v_seller.calculation_method,v_seller.agreed_percent,v_seller.agreed_fixed_amount)
            is distinct from app_private.brokerage_term_value(v_buyer.calculation_method,v_buyer.agreed_percent,v_buyer.agreed_fixed_amount)
         or v_seller.calculation_basis_kind is distinct from v_buyer.calculation_basis_kind then
        raise exception 'MANDATE_DUAL_AGENCY_TERMS_MUST_MATCH' using errcode='22023';
      end if;
    elsif v_mandate.client_side='SELLER' then
      if v_seller.calculation_method is distinct from v_buyer.calculation_method then
        raise exception 'MANDATE_BUYER_TERM_METHOD_MISMATCH' using errcode='22023';
      end if;
      if app_private.brokerage_term_value(v_buyer.calculation_method,v_buyer.agreed_percent,v_buyer.agreed_fixed_amount)
         > app_private.brokerage_term_value(v_seller.calculation_method,v_seller.agreed_percent,v_seller.agreed_fixed_amount) then
        raise exception 'MANDATE_BUYER_TERM_EXCEEDS_SELLER_TERM' using errcode='22023';
      end if;
    end if;
  end if;

  if tg_op='DELETE' then return old; end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------- Prüfung Auftrag

create or replace function app_private.validate_brokerage_mandate()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_property public.properties%rowtype;
  v_seller_value numeric;
  v_buyer_value numeric;
  v_seller_method text;
  v_buyer_method text;
begin
  if tg_op='INSERT' and new.status not in ('DRAFT') then
    raise exception 'MANDATE_MUST_START_DRAFT' using errcode='22023';
  end if;

  if tg_op='UPDATE' then
    if old.mandate_number is distinct from new.mandate_number then
      raise exception 'MANDATE_NUMBER_IMMUTABLE' using errcode='42501';
    end if;
    if old.status is distinct from new.status and not exists(
      select 1 from public.brokerage_mandate_status_transitions t
      where t.from_status=old.status and t.to_status=new.status
    ) then
      raise exception 'INVALID_MANDATE_STATUS_TRANSITION:%->%',old.status,new.status using errcode='22023';
    end if;
    if old.archived_at is not null and new.archived_at is not null and row(
      new.property_id,new.lead_id,new.mandate_type,new.client_side,new.client_is_consumer,new.concluded_on,
      new.conclusion_channel,new.text_form_confirmed,new.term_start,new.term_end,new.renewal_mode,new.renewal_months,
      new.notice_period_days,new.terminated_on,new.termination_reason,new.actual_end_on,new.client_share_payment_proof_on,
      new.withdrawal_instruction_given_on,new.withdrawal_instruction_form,new.withdrawal_deadline_on,
      new.early_start_requested_on,new.early_start_value_compensation_ack,new.withdrawn_on,new.status,
      new.primary_responsible_user,new.internal_notes
    ) is distinct from row(
      old.property_id,old.lead_id,old.mandate_type,old.client_side,old.client_is_consumer,old.concluded_on,
      old.conclusion_channel,old.text_form_confirmed,old.term_start,old.term_end,old.renewal_mode,old.renewal_months,
      old.notice_period_days,old.terminated_on,old.termination_reason,old.actual_end_on,old.client_share_payment_proof_on,
      old.withdrawal_instruction_given_on,old.withdrawal_instruction_form,old.withdrawal_deadline_on,
      old.early_start_requested_on,old.early_start_value_compensation_ack,old.withdrawn_on,old.status,
      old.primary_responsible_user,old.internal_notes
    ) then
      raise exception 'ARCHIVED_MANDATE_IMMUTABLE' using errcode='22023';
    end if;
  end if;

  select * into v_property from public.properties where id=new.property_id;
  if v_property.id is null then raise exception 'MANDATE_PROPERTY_NOT_FOUND' using errcode='P0002'; end if;

  if new.lead_id is not null and not exists(select 1 from public.leads l where l.id=new.lead_id) then
    raise exception 'MANDATE_LEAD_NOT_FOUND' using errcode='P0002';
  end if;

  if not exists(select 1 from public.profiles p where p.user_id=new.primary_responsible_user and p.status='ACTIVE') then
    raise exception 'MANDATE_RESPONSIBLE_USER_INACTIVE' using errcode='22023';
  end if;

  if new.status='WITHDRAWN' and new.withdrawn_on is null then
    raise exception 'MANDATE_WITHDRAWN_DATE_REQUIRED' using errcode='22023';
  end if;
  if new.status='TERMINATED' and new.terminated_on is null then
    raise exception 'MANDATE_TERMINATION_DATE_REQUIRED' using errcode='22023';
  end if;

  -- Der Auftrag darf nur mit vollständigen Grunddaten und Provisionsvereinbarung aktiv werden.
  if new.status='ACTIVE' then
    if new.concluded_on is null then raise exception 'MANDATE_CONCLUDED_DATE_REQUIRED' using errcode='22023'; end if;
    if new.term_start is null then raise exception 'MANDATE_TERM_START_REQUIRED' using errcode='22023'; end if;
    if not exists(select 1 from public.brokerage_mandate_clients c where c.mandate_id=new.id) then
      raise exception 'MANDATE_CLIENT_REQUIRED' using errcode='22023';
    end if;

    select t.calculation_method, app_private.brokerage_term_value(t.calculation_method,t.agreed_percent,t.agreed_fixed_amount)
      into v_seller_method, v_seller_value
    from public.brokerage_mandate_commission_terms t where t.mandate_id=new.id and t.side='SELLER';
    select t.calculation_method, app_private.brokerage_term_value(t.calculation_method,t.agreed_percent,t.agreed_fixed_amount)
      into v_buyer_method, v_buyer_value
    from public.brokerage_mandate_commission_terms t where t.mandate_id=new.id and t.side='BUYER';

    if new.client_side='BOTH' then
      if v_seller_value is null or v_buyer_value is null then
        raise exception 'MANDATE_DUAL_AGENCY_REQUIRES_BOTH_TERMS' using errcode='22023';
      end if;
      if v_seller_method is distinct from v_buyer_method or v_seller_value is distinct from v_buyer_value then
        raise exception 'MANDATE_DUAL_AGENCY_TERMS_MUST_MATCH' using errcode='22023';
      end if;
    elsif new.client_side='SELLER' then
      if v_seller_value is null then raise exception 'MANDATE_SELLER_TERM_REQUIRED' using errcode='22023'; end if;
      if v_buyer_value is not null and v_buyer_value > v_seller_value then
        raise exception 'MANDATE_BUYER_TERM_EXCEEDS_SELLER_TERM' using errcode='22023';
      end if;
    else
      if v_buyer_value is null then raise exception 'MANDATE_BUYER_TERM_REQUIRED' using errcode='22023'; end if;
    end if;
  end if;

  return new;
end;
$function$;

-- ---------------------------------------------------------------- Provision an den Auftrag koppeln

create or replace function app_private.validate_commission_mandate_link()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_mandate public.brokerage_mandates%rowtype;
  v_active_mandate uuid;
begin
  if new.mandate_id is not null then
    select * into v_mandate from public.brokerage_mandates where id=new.mandate_id;
    if v_mandate.id is null then raise exception 'COMMISSION_MANDATE_NOT_FOUND' using errcode='P0002'; end if;
    if v_mandate.property_id <> new.property_id then
      raise exception 'COMMISSION_MANDATE_PROPERTY_MISMATCH' using errcode='22023';
    end if;
    if not exists(
      select 1 from public.brokerage_mandate_commission_terms t
      where t.mandate_id=new.mandate_id and t.side=new.side
    ) then
      raise exception 'COMMISSION_MANDATE_SIDE_NOT_AGREED' using errcode='22023';
    end if;
  end if;

  -- Die Käuferprovision wird erst fällig, wenn der Auftraggeberanteil nachweislich gezahlt ist.
  if new.side='BUYER' and new.status in ('DUE','INVOICED','PARTIALLY_PAID','PAID') then
    if new.mandate_id is null then
      select m.id into v_active_mandate
      from public.brokerage_mandates m
      where m.property_id=new.property_id and m.archived_at is null and m.status='ACTIVE'
      limit 1;
      if v_active_mandate is not null then
        raise exception 'COMMISSION_MANDATE_LINK_REQUIRED' using errcode='22023';
      end if;
    elsif v_mandate.client_side <> 'BUYER'
      and exists(select 1 from public.brokerage_mandate_commission_terms t where t.mandate_id=new.mandate_id and t.side='SELLER')
      and v_mandate.client_share_payment_proof_on is null then
      raise exception 'COMMISSION_CLIENT_SHARE_PROOF_REQUIRED' using errcode='22023';
    end if;
  end if;

  return new;
end;
$function$;

-- ---------------------------------------------------------------- RLS

alter table public.brokerage_mandates enable row level security;
alter table public.brokerage_mandate_clients enable row level security;
alter table public.brokerage_mandate_commission_terms enable row level security;
alter table public.brokerage_mandate_status_transitions enable row level security;

drop policy if exists brokerage_mandates_select on public.brokerage_mandates;
create policy brokerage_mandates_select on public.brokerage_mandates for select to authenticated
using ((select app_private.has_permission('mandate.read')));

drop policy if exists brokerage_mandates_insert on public.brokerage_mandates;
create policy brokerage_mandates_insert on public.brokerage_mandates for insert to authenticated
with check ((select app_private.has_permission('mandate.write')) and created_by=(select auth.uid()));

drop policy if exists brokerage_mandates_update on public.brokerage_mandates;
create policy brokerage_mandates_update on public.brokerage_mandates for update to authenticated
using ((select app_private.has_permission('mandate.write')))
with check ((select app_private.has_permission('mandate.write')));

drop policy if exists brokerage_mandate_clients_select on public.brokerage_mandate_clients;
create policy brokerage_mandate_clients_select on public.brokerage_mandate_clients for select to authenticated
using ((select app_private.has_permission('mandate.read')));

drop policy if exists brokerage_mandate_clients_insert on public.brokerage_mandate_clients;
create policy brokerage_mandate_clients_insert on public.brokerage_mandate_clients for insert to authenticated
with check ((select app_private.has_permission('mandate.write')) and created_by=(select auth.uid()));

drop policy if exists brokerage_mandate_clients_update on public.brokerage_mandate_clients;
create policy brokerage_mandate_clients_update on public.brokerage_mandate_clients for update to authenticated
using ((select app_private.has_permission('mandate.write')))
with check ((select app_private.has_permission('mandate.write')));

drop policy if exists brokerage_mandate_clients_delete on public.brokerage_mandate_clients;
create policy brokerage_mandate_clients_delete on public.brokerage_mandate_clients for delete to authenticated
using ((select app_private.has_permission('mandate.write')));

drop policy if exists brokerage_mandate_terms_select on public.brokerage_mandate_commission_terms;
create policy brokerage_mandate_terms_select on public.brokerage_mandate_commission_terms for select to authenticated
using ((select app_private.has_permission('mandate.read')));

drop policy if exists brokerage_mandate_terms_insert on public.brokerage_mandate_commission_terms;
create policy brokerage_mandate_terms_insert on public.brokerage_mandate_commission_terms for insert to authenticated
with check ((select app_private.has_permission('mandate.write')) and created_by=(select auth.uid()));

drop policy if exists brokerage_mandate_terms_update on public.brokerage_mandate_commission_terms;
create policy brokerage_mandate_terms_update on public.brokerage_mandate_commission_terms for update to authenticated
using ((select app_private.has_permission('mandate.write')))
with check ((select app_private.has_permission('mandate.write')));

drop policy if exists brokerage_mandate_terms_delete on public.brokerage_mandate_commission_terms;
create policy brokerage_mandate_terms_delete on public.brokerage_mandate_commission_terms for delete to authenticated
using ((select app_private.has_permission('mandate.write')));

drop policy if exists brokerage_mandate_status_transitions_select on public.brokerage_mandate_status_transitions;
create policy brokerage_mandate_status_transitions_select on public.brokerage_mandate_status_transitions for select to authenticated
using ((select app_private.has_permission('mandate.read')));

-- ---------------------------------------------------------------- Trigger

drop trigger if exists brokerage_mandates_10_validate on public.brokerage_mandates;
create trigger brokerage_mandates_10_validate before insert or update on public.brokerage_mandates
for each row execute function app_private.validate_brokerage_mandate();

drop trigger if exists brokerage_mandates_20_archive_guard on public.brokerage_mandates;
create trigger brokerage_mandates_20_archive_guard before update on public.brokerage_mandates
for each row execute function app_private.enforce_archive_permission('mandate.archive');

drop trigger if exists brokerage_mandates_90_set_update_metadata on public.brokerage_mandates;
create trigger brokerage_mandates_90_set_update_metadata before update on public.brokerage_mandates
for each row execute function app_private.set_business_update_metadata();

drop trigger if exists brokerage_mandates_audit on public.brokerage_mandates;
create trigger brokerage_mandates_audit after insert or update or delete on public.brokerage_mandates
for each row execute function app_private.audit_row_change('BROKERAGE_MANDATE','mandate_number');

drop trigger if exists brokerage_mandate_clients_40_metadata on public.brokerage_mandate_clients;
create trigger brokerage_mandate_clients_40_metadata before update on public.brokerage_mandate_clients
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists brokerage_mandate_clients_90_audit on public.brokerage_mandate_clients;
create trigger brokerage_mandate_clients_90_audit after insert or update or delete on public.brokerage_mandate_clients
for each row execute function app_private.audit_row_change('BROKERAGE_MANDATE_CLIENT','id');

drop trigger if exists brokerage_mandate_terms_10_validate on public.brokerage_mandate_commission_terms;
create trigger brokerage_mandate_terms_10_validate after insert or update or delete on public.brokerage_mandate_commission_terms
for each row execute function app_private.validate_brokerage_mandate_terms();

drop trigger if exists brokerage_mandate_terms_40_metadata on public.brokerage_mandate_commission_terms;
create trigger brokerage_mandate_terms_40_metadata before update on public.brokerage_mandate_commission_terms
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists brokerage_mandate_terms_90_audit on public.brokerage_mandate_commission_terms;
create trigger brokerage_mandate_terms_90_audit after insert or update or delete on public.brokerage_mandate_commission_terms
for each row execute function app_private.audit_row_change('BROKERAGE_MANDATE_TERM','side');

drop trigger if exists commissions_15_mandate_link on public.commissions;
create trigger commissions_15_mandate_link before insert or update on public.commissions
for each row execute function app_private.validate_commission_mandate_link();

-- ---------------------------------------------------------------- Data-API-Rechte

grant select, insert, update on public.brokerage_mandates to authenticated;
grant select, insert, update, delete on public.brokerage_mandate_clients to authenticated;
grant select, insert, update, delete on public.brokerage_mandate_commission_terms to authenticated;
grant select on public.brokerage_mandate_status_transitions to authenticated;
grant usage, select on sequence public.brokerage_mandate_number_seq to authenticated;
