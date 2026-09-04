-- Thema 8 (Maklerpraxis): WEG- und Mietdaten.
-- Eigentumswohnungen und vermietete Objekte sollen so abgebildet sein, dass
-- Kapitalanleger und Kaeufer die ueblichen Fragen beantwortet bekommen.
-- Eine Rendite erscheint nur bei vollstaendiger Datenlage und ist ausdruecklich
-- als Berechnung aus den erfassten Werten gekennzeichnet.

-- ---------------------------------------------------------------------------
-- WEG
-- ---------------------------------------------------------------------------
create table if not exists public.property_hoa_data (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null unique constraint property_hoa_data_property_id_fkey references public.properties(id) on delete cascade,

  -- Hausgeld getrennt nach Umlage und Ruecklagenanteil. Der Gesamtbetrag steht
  -- weiterhin in properties.hoa_fee; hier steht die Aufteilung.
  fee_operating numeric(10,2) check (fee_operating is null or fee_operating >= 0),
  fee_reserve numeric(10,2) check (fee_reserve is null or fee_reserve >= 0),
  fee_reference_month date,

  maintenance_reserve_balance numeric(14,2) check (maintenance_reserve_balance is null or maintenance_reserve_balance >= 0),
  maintenance_reserve_date date,

  special_use_rights text,

  manager_organization_id uuid constraint property_hoa_data_manager_organization_id_fkey references public.organizations(id) on delete set null,
  manager_contact_id uuid constraint property_hoa_data_manager_contact_id_fkey references public.contacts(id) on delete set null,
  manager_contract_until date,

  resolution_record_available boolean not null default false,
  economic_plan_year integer check (economic_plan_year is null or (economic_plan_year between 1950 and 2100)),
  annual_statement_year integer check (annual_statement_year is null or (annual_statement_year between 1950 and 2100)),
  upcoming_renovations text,
  notes text,

  created_at timestamptz not null default now(),
  created_by uuid constraint property_hoa_data_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint property_hoa_data_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),

  constraint property_hoa_data_reserve_dated_check check (
    maintenance_reserve_balance is null or maintenance_reserve_date is not null
  )
);

comment on table public.property_hoa_data is 'WEG-Daten je Eigentumswohnung. Der Miteigentumsanteil steht bewusst weiterhin in property_legal_data und wird hier nicht doppelt gefuehrt.';
comment on column public.property_hoa_data.fee_operating is 'Umlagefaehiger bzw. bewirtschaftender Anteil des Hausgelds. Der Gesamtbetrag bleibt in properties.hoa_fee.';

create index if not exists property_hoa_data_manager_org_idx on public.property_hoa_data(manager_organization_id);
create index if not exists property_hoa_data_manager_contact_idx on public.property_hoa_data(manager_contact_id);
create index if not exists property_hoa_data_created_by_idx on public.property_hoa_data(created_by);
create index if not exists property_hoa_data_updated_by_idx on public.property_hoa_data(updated_by);

create table if not exists public.property_hoa_special_levies (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null constraint property_hoa_special_levies_property_id_fkey references public.properties(id) on delete cascade,
  purpose text not null check (coalesce(btrim(purpose),'') <> ''),
  status text not null default 'EXPECTED' check (status in ('EXPECTED','RESOLVED','PAID','CANCELLED')),
  total_amount numeric(14,2) check (total_amount is null or total_amount >= 0),
  own_share_amount numeric(14,2) check (own_share_amount is null or own_share_amount >= 0),
  resolved_on date,
  due_on date,
  note text,

  created_at timestamptz not null default now(),
  created_by uuid constraint property_hoa_special_levies_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint property_hoa_special_levies_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),

  constraint property_hoa_special_levies_resolved_dated_check check (
    status = 'EXPECTED' or resolved_on is not null
  ),
  constraint property_hoa_special_levies_share_le_total_check check (
    own_share_amount is null or total_amount is null or own_share_amount <= total_amount
  ),
  constraint property_hoa_special_levies_share_required_check check (
    status = 'EXPECTED' or own_share_amount is not null
  )
);

comment on table public.property_hoa_special_levies is 'Beschlossene und absehbare Sonderumlagen. Eine beschlossene Umlage traegt Beschlussdatum und den auf das Objekt entfallenden Anteil.';

create index if not exists property_hoa_special_levies_property_idx on public.property_hoa_special_levies(property_id, status);
create index if not exists property_hoa_special_levies_created_by_idx on public.property_hoa_special_levies(created_by);
create index if not exists property_hoa_special_levies_updated_by_idx on public.property_hoa_special_levies(updated_by);

-- ---------------------------------------------------------------------------
-- Mietverhaeltnis
-- ---------------------------------------------------------------------------
create table if not exists public.property_tenancies (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null constraint property_tenancies_property_id_fkey references public.properties(id) on delete cascade,
  tenant_contact_id uuid constraint property_tenancies_tenant_contact_id_fkey references public.contacts(id) on delete set null,
  tenant_name text,

  contract_date date,
  contract_type text not null default 'UNLIMITED' check (contract_type in ('UNLIMITED','FIXED_TERM','SUBSIDISED','COMMERCIAL','OTHER')),
  starts_on date,
  ends_on date,

  rent_cold numeric(12,2) check (rent_cold is null or rent_cold >= 0),
  operating_cost_advance numeric(12,2) check (operating_cost_advance is null or operating_cost_advance >= 0),
  heating_cost_advance numeric(12,2) check (heating_cost_advance is null or heating_cost_advance >= 0),

  deposit_amount numeric(12,2) check (deposit_amount is null or deposit_amount >= 0),
  deposit_form text check (deposit_form is null or deposit_form in ('CASH','SAVINGS_ACCOUNT','BANK_GUARANTEE','INSURANCE','OTHER')),
  deposit_deposited boolean not null default false,
  deposit_note text,

  rent_adjustment_type text not null default 'NONE' check (rent_adjustment_type in ('NONE','STAGED','INDEX')),
  rent_adjustment_note text,
  termination_waiver_until date,
  pending_rent_increase boolean not null default false,
  pending_rent_increase_note text,

  arrears_amount numeric(12,2) check (arrears_amount is null or arrears_amount >= 0),
  arrears_note text,

  sublet_permitted boolean not null default false,
  sublet_exists boolean not null default false,

  tenant_pre_emption_relevant boolean not null default false,
  conversion_blocking_until date,

  status text not null default 'ACTIVE' check (status in ('ACTIVE','ENDED','TERMINATED')),
  ended_on date,
  notes text,

  created_at timestamptz not null default now(),
  created_by uuid constraint property_tenancies_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint property_tenancies_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  archived_at timestamptz,
  archived_by uuid constraint property_tenancies_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),

  constraint property_tenancies_tenant_named_check check (
    tenant_contact_id is not null or coalesce(btrim(tenant_name),'') <> ''
  ),
  constraint property_tenancies_period_check check (ends_on is null or starts_on is null or ends_on >= starts_on),
  constraint property_tenancies_fixed_term_check check (contract_type <> 'FIXED_TERM' or ends_on is not null),
  constraint property_tenancies_deposit_form_required_check check (
    deposit_amount is null or deposit_form is not null
  ),
  constraint property_tenancies_ended_dated_check check (status = 'ACTIVE' or ended_on is not null),
  constraint property_tenancies_active_undated_check check (status <> 'ACTIVE' or ended_on is null),
  constraint property_tenancies_adjustment_noted_check check (
    rent_adjustment_type = 'NONE' or coalesce(btrim(rent_adjustment_note),'') <> ''
  ),
  constraint property_tenancies_sublet_consistent_check check (sublet_permitted or not sublet_exists)
);

comment on table public.property_tenancies is 'Mietverhaeltnis je Immobilie. Das System erfasst die Konditionen und Fristen; es beurteilt nicht, ob eine Mieterhoehung zulaessig oder eine Kuendigung wirksam ist.';
comment on column public.property_tenancies.conversion_blocking_until is 'Ende einer Sperrfrist nach Umwandlung in Wohnungseigentum. Reine Erfassung, keine Pruefung der Voraussetzungen.';

create unique index if not exists property_tenancies_one_active_idx
  on public.property_tenancies(property_id) where status = 'ACTIVE' and archived_at is null;
create index if not exists property_tenancies_property_idx on public.property_tenancies(property_id, status);
create index if not exists property_tenancies_tenant_idx on public.property_tenancies(tenant_contact_id);
create index if not exists property_tenancies_created_by_idx on public.property_tenancies(created_by);
create index if not exists property_tenancies_updated_by_idx on public.property_tenancies(updated_by);
create index if not exists property_tenancies_archived_by_idx on public.property_tenancies(archived_by);

-- ---------------------------------------------------------------------------
-- Regeln
-- ---------------------------------------------------------------------------
create or replace function app_private.validate_property_hoa_data()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_total numeric;
begin
  if not exists (select 1 from public.properties p where p.id = new.property_id) then
    raise exception 'HOA_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.maintenance_reserve_date is not null and new.maintenance_reserve_date > current_date then
    raise exception 'HOA_RESERVE_DATE_IN_FUTURE' using errcode = '22023';
  end if;
  if new.manager_organization_id is not null
     and not exists (select 1 from public.organizations o where o.id = new.manager_organization_id) then
    raise exception 'HOA_MANAGER_ORGANIZATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Die Aufteilung darf das gefuehrte Hausgeld nicht ueberschreiten; sonst
  -- widersprechen sich Objektakte und WEG-Daten.
  select hoa_fee into v_total from public.properties where id = new.property_id;
  if v_total is not null and new.fee_operating is not null and new.fee_reserve is not null
     and (new.fee_operating + new.fee_reserve) > v_total + 0.01 then
    raise exception 'HOA_FEE_SPLIT_EXCEEDS_TOTAL' using errcode = '22023';
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_hoa_special_levy()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if not exists (select 1 from public.properties p where p.id = new.property_id) then
    raise exception 'LEVY_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.resolved_on is not null and new.resolved_on > current_date then
    raise exception 'LEVY_RESOLVED_IN_FUTURE' using errcode = '22023';
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_property_tenancy()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if not exists (select 1 from public.properties p where p.id = new.property_id) then
    raise exception 'TENANCY_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.tenant_contact_id is not null
     and not exists (select 1 from public.contacts c where c.id = new.tenant_contact_id) then
    raise exception 'TENANCY_CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.contract_date is not null and new.contract_date > current_date then
    raise exception 'TENANCY_CONTRACT_DATE_IN_FUTURE' using errcode = '22023';
  end if;
  if new.ended_on is not null and new.ended_on > current_date then
    raise exception 'TENANCY_END_IN_FUTURE' using errcode = '22023';
  end if;
  if new.ended_on is not null and new.starts_on is not null and new.ended_on < new.starts_on then
    raise exception 'TENANCY_END_BEFORE_START' using errcode = '22023';
  end if;
  if new.deposit_deposited and new.deposit_amount is null then
    raise exception 'TENANCY_DEPOSIT_AMOUNT_REQUIRED' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE' and old.status <> 'ACTIVE' and new.status = 'ACTIVE' then
    raise exception 'TENANCY_CANNOT_REACTIVATE' using errcode = '22023';
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.property_hoa_data enable row level security;
alter table public.property_hoa_special_levies enable row level security;
alter table public.property_tenancies enable row level security;

drop policy if exists property_hoa_data_select on public.property_hoa_data;
create policy property_hoa_data_select on public.property_hoa_data for select to authenticated
using ((select app_private.has_permission('property.read')));

drop policy if exists property_hoa_data_insert on public.property_hoa_data;
create policy property_hoa_data_insert on public.property_hoa_data for insert to authenticated
with check ((select app_private.has_permission('property.write')) and created_by = (select auth.uid()));

drop policy if exists property_hoa_data_update on public.property_hoa_data;
create policy property_hoa_data_update on public.property_hoa_data for update to authenticated
using ((select app_private.has_permission('property.write')))
with check ((select app_private.has_permission('property.write')));

drop policy if exists property_hoa_special_levies_select on public.property_hoa_special_levies;
create policy property_hoa_special_levies_select on public.property_hoa_special_levies for select to authenticated
using ((select app_private.has_permission('property.read')));

drop policy if exists property_hoa_special_levies_write on public.property_hoa_special_levies;
create policy property_hoa_special_levies_write on public.property_hoa_special_levies for all to authenticated
using ((select app_private.has_permission('property.write')))
with check ((select app_private.has_permission('property.write')));

drop policy if exists property_tenancies_select on public.property_tenancies;
create policy property_tenancies_select on public.property_tenancies for select to authenticated
using ((select app_private.has_permission('property.read')));

drop policy if exists property_tenancies_insert on public.property_tenancies;
create policy property_tenancies_insert on public.property_tenancies for insert to authenticated
with check ((select app_private.has_permission('property.write')) and created_by = (select auth.uid()));

drop policy if exists property_tenancies_update on public.property_tenancies;
create policy property_tenancies_update on public.property_tenancies for update to authenticated
using ((select app_private.has_permission('property.write')))
with check ((select app_private.has_permission('property.write')));

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
drop trigger if exists property_hoa_data_10_validate on public.property_hoa_data;
create trigger property_hoa_data_10_validate before insert or update on public.property_hoa_data
for each row execute function app_private.validate_property_hoa_data();

drop trigger if exists property_hoa_data_40_metadata on public.property_hoa_data;
create trigger property_hoa_data_40_metadata before update on public.property_hoa_data
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists property_hoa_data_90_audit on public.property_hoa_data;
create trigger property_hoa_data_90_audit after insert or update or delete on public.property_hoa_data
for each row execute function app_private.audit_property_child('HOA_DATA');

drop trigger if exists property_hoa_special_levies_10_validate on public.property_hoa_special_levies;
create trigger property_hoa_special_levies_10_validate before insert or update on public.property_hoa_special_levies
for each row execute function app_private.validate_hoa_special_levy();

drop trigger if exists property_hoa_special_levies_40_metadata on public.property_hoa_special_levies;
create trigger property_hoa_special_levies_40_metadata before update on public.property_hoa_special_levies
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists property_hoa_special_levies_90_audit on public.property_hoa_special_levies;
create trigger property_hoa_special_levies_90_audit after insert or update or delete on public.property_hoa_special_levies
for each row execute function app_private.audit_property_child('SPECIAL_LEVY');

drop trigger if exists property_tenancies_10_validate on public.property_tenancies;
create trigger property_tenancies_10_validate before insert or update on public.property_tenancies
for each row execute function app_private.validate_property_tenancy();

drop trigger if exists property_tenancies_20_archive_guard on public.property_tenancies;
create trigger property_tenancies_20_archive_guard before update on public.property_tenancies
for each row execute function app_private.enforce_archive_permission('property.archive');

drop trigger if exists property_tenancies_40_metadata on public.property_tenancies;
create trigger property_tenancies_40_metadata before update on public.property_tenancies
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists property_tenancies_90_audit on public.property_tenancies;
create trigger property_tenancies_90_audit after insert or update or delete on public.property_tenancies
for each row execute function app_private.audit_property_child('TENANCY');

grant select, insert, update on public.property_hoa_data to authenticated;
grant select, insert, update, delete on public.property_hoa_special_levies to authenticated;
grant select, insert, update on public.property_tenancies to authenticated;
