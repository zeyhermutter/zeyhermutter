-- Thema 7 (Maklerpraxis): Preisstrategie, Preisverlauf und Wertermittlung.
-- Preisentscheidungen sollen gegenueber dem Eigentuemer und im Rueckblick
-- begruendbar sein. Alle Werte bleiben ausdruecklich Einschaetzungen; das System
-- empfiehlt keinen Preis und garantiert keinen.

insert into public.permissions(key,description) values
  ('valuation.read','Wertermittlungen lesen'),
  ('valuation.write','Wertermittlungen bearbeiten')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('valuation.read','valuation.write')
where r.key in ('admin','managing_director','agent','assistance')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Preisverlauf
-- ---------------------------------------------------------------------------
create table if not exists public.property_price_stages (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null constraint property_price_stages_property_id_fkey references public.properties(id) on delete cascade,
  price numeric(14,2) not null check (price > 0),
  previous_price numeric(14,2) check (previous_price is null or previous_price > 0),
  effective_from date not null default current_date,
  reason text,
  decided_by uuid constraint property_price_stages_decided_by_fkey references public.profiles(user_id),
  is_initial boolean not null default false,
  note text,

  created_at timestamptz not null default now(),
  created_by uuid constraint property_price_stages_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint property_price_stages_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),

  unique (property_id, effective_from),
  constraint property_price_stages_initial_check check (is_initial or previous_price is not null),
  constraint property_price_stages_change_check check (previous_price is null or previous_price <> price),
  constraint property_price_stages_reason_check check (is_initial or coalesce(btrim(reason),'') <> '')
);

comment on table public.property_price_stages is 'Preisverlauf je Immobilie. Jede Stufe traegt Datum, alten und neuen Wert, Begruendung und Verantwortlichen. Die Kennzahlen je Stufe werden aus Anfragen, Besichtigungen und Kaufangeboten abgeleitet, nicht gespeichert.';
comment on column public.property_price_stages.is_initial is 'Die erste Stufe ist der Ausgangspreis; sie braucht keinen Vorwert und keine Begruendung.';

create index if not exists property_price_stages_property_idx on public.property_price_stages(property_id, effective_from desc);
create index if not exists property_price_stages_decided_by_idx on public.property_price_stages(decided_by);
create index if not exists property_price_stages_created_by_idx on public.property_price_stages(created_by);
create index if not exists property_price_stages_updated_by_idx on public.property_price_stages(updated_by);

-- ---------------------------------------------------------------------------
-- Wertermittlung
-- ---------------------------------------------------------------------------
create sequence if not exists public.valuation_number_seq;

create table if not exists public.property_valuations (
  id uuid primary key default gen_random_uuid(),
  valuation_number text not null unique default ('ZM-WE-' || lpad(nextval('public.valuation_number_seq'::regclass)::text, 6, '0')),
  property_id uuid constraint property_valuations_property_id_fkey references public.properties(id) on delete cascade,
  lead_id uuid constraint property_valuations_lead_id_fkey references public.leads(id) on delete cascade,

  method text not null check (method in ('COMPARATIVE','INCOME','ASSET','MARKET_ESTIMATE')),
  valued_on date not null default current_date,
  valuer_user uuid constraint property_valuations_valuer_user_fkey references public.profiles(user_id),
  valuer_name text,

  land_reference_value numeric(12,2) check (land_reference_value is null or land_reference_value >= 0),
  land_reference_date date,
  land_reference_source text,

  range_from numeric(14,2) check (range_from is null or range_from > 0),
  range_to numeric(14,2) check (range_to is null or range_to > 0),
  result_value numeric(14,2) check (result_value is null or result_value > 0),

  assumptions text,
  notes text,

  created_at timestamptz not null default now(),
  created_by uuid constraint property_valuations_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint property_valuations_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  archived_at timestamptz,
  archived_by uuid constraint property_valuations_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),

  constraint property_valuations_target_check check (property_id is not null or lead_id is not null),
  constraint property_valuations_range_check check (range_from is null or range_to is null or range_to >= range_from),
  constraint property_valuations_result_in_range_check check (
    result_value is null or range_from is null or range_to is null
    or (result_value >= range_from and result_value <= range_to)
  ),
  constraint property_valuations_valued_on_check check (valued_on <= current_date),
  constraint property_valuations_land_reference_check check (
    land_reference_value is null or (land_reference_date is not null and coalesce(btrim(land_reference_source),'') <> '')
  ),
  constraint property_valuations_valuer_check check (valuer_user is not null or coalesce(btrim(valuer_name),'') <> '')
);

comment on table public.property_valuations is 'Wertermittlung am Lead und am Objekt. Alle Werte sind ausdrueckliche Einschaetzungen, keine Zusicherung und keine Preisgarantie.';
comment on column public.property_valuations.land_reference_value is 'Bodenrichtwert je Quadratmeter. Nur mit Stichtag und Quelle speicherbar, damit die Angabe nachvollziehbar bleibt.';

create index if not exists property_valuations_property_idx on public.property_valuations(property_id, valued_on desc);
create index if not exists property_valuations_lead_idx on public.property_valuations(lead_id, valued_on desc);
create index if not exists property_valuations_valuer_idx on public.property_valuations(valuer_user);
create index if not exists property_valuations_created_by_idx on public.property_valuations(created_by);
create index if not exists property_valuations_updated_by_idx on public.property_valuations(updated_by);
create index if not exists property_valuations_archived_by_idx on public.property_valuations(archived_by);

create table if not exists public.property_valuation_comparables (
  id uuid primary key default gen_random_uuid(),
  valuation_id uuid not null constraint property_valuation_comparables_valuation_id_fkey references public.property_valuations(id) on delete cascade,
  label text not null check (coalesce(btrim(label),'') <> ''),
  price numeric(14,2) not null check (price > 0),
  living_area_sqm numeric(10,2) check (living_area_sqm is null or living_area_sqm > 0),
  plot_area_sqm numeric(12,2) check (plot_area_sqm is null or plot_area_sqm > 0),
  reference_date date not null,
  source text not null check (coalesce(btrim(source),'') <> ''),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid constraint property_valuation_comparables_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint property_valuation_comparables_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),
  constraint property_valuation_comparables_date_check check (reference_date <= current_date)
);

comment on table public.property_valuation_comparables is 'Herangezogene Vergleichsobjekte. Quelle und Stichtag sind verpflichtend, damit eine Einschaetzung belegbar bleibt.';

create index if not exists property_valuation_comparables_valuation_idx on public.property_valuation_comparables(valuation_id);
create index if not exists property_valuation_comparables_created_by_idx on public.property_valuation_comparables(created_by);
create index if not exists property_valuation_comparables_updated_by_idx on public.property_valuation_comparables(updated_by);

create table if not exists public.property_valuation_adjustments (
  id uuid primary key default gen_random_uuid(),
  valuation_id uuid not null constraint property_valuation_adjustments_valuation_id_fkey references public.property_valuations(id) on delete cascade,
  label text not null check (coalesce(btrim(label),'') <> ''),
  amount numeric(14,2),
  percent numeric(6,3),
  reason text not null check (coalesce(btrim(reason),'') <> ''),
  created_at timestamptz not null default now(),
  created_by uuid constraint property_valuation_adjustments_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint property_valuation_adjustments_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),
  constraint property_valuation_adjustments_value_check check (
    (amount is not null and percent is null) or (amount is null and percent is not null)
  ),
  constraint property_valuation_adjustments_nonzero_check check (
    coalesce(amount, percent) <> 0
  )
);

comment on table public.property_valuation_adjustments is 'Zu- und Abschlaege der Wertermittlung. Entweder Betrag oder Prozentsatz, immer mit Begruendung.';

create index if not exists property_valuation_adjustments_valuation_idx on public.property_valuation_adjustments(valuation_id);
create index if not exists property_valuation_adjustments_created_by_idx on public.property_valuation_adjustments(created_by);
create index if not exists property_valuation_adjustments_updated_by_idx on public.property_valuation_adjustments(updated_by);

-- ---------------------------------------------------------------------------
-- Regeln
-- ---------------------------------------------------------------------------
create or replace function app_private.validate_property_price_stage()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_exists boolean;
  v_latest date;
  v_latest_price numeric;
begin
  if not exists (select 1 from public.properties p where p.id = new.property_id) then
    raise exception 'PRICE_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.effective_from > current_date then
    raise exception 'PRICE_STAGE_IN_FUTURE' using errcode = '22023';
  end if;

  select exists(select 1 from public.property_price_stages s
    where s.property_id = new.property_id and s.id is distinct from new.id) into v_exists;

  -- Die erste Stufe ist der Ausgangspreis, jede weitere eine Aenderung.
  if tg_op = 'INSERT' then
    if not v_exists and not new.is_initial then
      raise exception 'PRICE_FIRST_STAGE_MUST_BE_INITIAL' using errcode = '22023';
    end if;
    if v_exists and new.is_initial then
      raise exception 'PRICE_INITIAL_ALREADY_SET' using errcode = '22023';
    end if;
    if v_exists then
      select s.effective_from, s.price into v_latest, v_latest_price
      from public.property_price_stages s
      where s.property_id = new.property_id
      order by s.effective_from desc, s.created_at desc limit 1;
      if new.effective_from < v_latest then
        raise exception 'PRICE_STAGE_BEFORE_PREVIOUS' using errcode = '22023';
      end if;
      -- Der Vorwert muss dem tatsaechlich zuletzt gefuehrten Preis entsprechen.
      if new.previous_price is distinct from v_latest_price then
        raise exception 'PRICE_PREVIOUS_MISMATCH' using errcode = '22023';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' and old.is_initial is distinct from new.is_initial then
    raise exception 'PRICE_INITIAL_FLAG_IMMUTABLE' using errcode = '42501';
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_property_valuation()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if new.property_id is not null and not exists (select 1 from public.properties p where p.id = new.property_id) then
    raise exception 'VALUATION_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.lead_id is not null and not exists (select 1 from public.leads l where l.id = new.lead_id) then
    raise exception 'VALUATION_LEAD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.land_reference_date is not null and new.land_reference_date > current_date then
    raise exception 'VALUATION_LAND_REFERENCE_IN_FUTURE' using errcode = '22023';
  end if;
  -- Das Vergleichswertverfahren lebt von Vergleichsobjekten. Bei einem Ergebnis
  -- ohne einen einzigen Beleg waere die Einschaetzung nicht nachvollziehbar.
  if tg_op = 'UPDATE' and new.method = 'COMPARATIVE' and new.result_value is not null
     and not exists (select 1 from public.property_valuation_comparables c where c.valuation_id = new.id) then
    raise exception 'VALUATION_COMPARABLES_REQUIRED' using errcode = '22023';
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_valuation_child()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_archived timestamptz;
begin
  select archived_at into v_archived from public.property_valuations where id = new.valuation_id;
  if not found then
    raise exception 'VALUATION_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_archived is not null then
    raise exception 'ARCHIVED_VALUATION_IMMUTABLE' using errcode = '22023';
  end if;
  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.property_price_stages enable row level security;
alter table public.property_valuations enable row level security;
alter table public.property_valuation_comparables enable row level security;
alter table public.property_valuation_adjustments enable row level security;

drop policy if exists property_price_stages_select on public.property_price_stages;
create policy property_price_stages_select on public.property_price_stages for select to authenticated
using ((select app_private.has_permission('property.read')));

drop policy if exists property_price_stages_insert on public.property_price_stages;
create policy property_price_stages_insert on public.property_price_stages for insert to authenticated
with check ((select app_private.has_permission('property.write')) and created_by = (select auth.uid()));

drop policy if exists property_price_stages_update on public.property_price_stages;
create policy property_price_stages_update on public.property_price_stages for update to authenticated
using ((select app_private.has_permission('property.write')))
with check ((select app_private.has_permission('property.write')));

drop policy if exists property_valuations_select on public.property_valuations;
create policy property_valuations_select on public.property_valuations for select to authenticated
using ((select app_private.has_permission('valuation.read')));

drop policy if exists property_valuations_insert on public.property_valuations;
create policy property_valuations_insert on public.property_valuations for insert to authenticated
with check ((select app_private.has_permission('valuation.write')) and created_by = (select auth.uid()));

drop policy if exists property_valuations_update on public.property_valuations;
create policy property_valuations_update on public.property_valuations for update to authenticated
using ((select app_private.has_permission('valuation.write')))
with check ((select app_private.has_permission('valuation.write')));

drop policy if exists property_valuation_comparables_select on public.property_valuation_comparables;
create policy property_valuation_comparables_select on public.property_valuation_comparables for select to authenticated
using ((select app_private.has_permission('valuation.read')));

drop policy if exists property_valuation_comparables_write on public.property_valuation_comparables;
create policy property_valuation_comparables_write on public.property_valuation_comparables for all to authenticated
using ((select app_private.has_permission('valuation.write')))
with check ((select app_private.has_permission('valuation.write')));

drop policy if exists property_valuation_adjustments_select on public.property_valuation_adjustments;
create policy property_valuation_adjustments_select on public.property_valuation_adjustments for select to authenticated
using ((select app_private.has_permission('valuation.read')));

drop policy if exists property_valuation_adjustments_write on public.property_valuation_adjustments;
create policy property_valuation_adjustments_write on public.property_valuation_adjustments for all to authenticated
using ((select app_private.has_permission('valuation.write')))
with check ((select app_private.has_permission('valuation.write')));

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
drop trigger if exists property_price_stages_10_validate on public.property_price_stages;
create trigger property_price_stages_10_validate before insert or update on public.property_price_stages
for each row execute function app_private.validate_property_price_stage();

drop trigger if exists property_price_stages_40_metadata on public.property_price_stages;
create trigger property_price_stages_40_metadata before update on public.property_price_stages
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists property_price_stages_90_audit on public.property_price_stages;
create trigger property_price_stages_90_audit after insert or update or delete on public.property_price_stages
for each row execute function app_private.audit_property_child('PRICE_STAGE');

drop trigger if exists property_valuations_10_validate on public.property_valuations;
create trigger property_valuations_10_validate before insert or update on public.property_valuations
for each row execute function app_private.validate_property_valuation();

drop trigger if exists property_valuations_40_metadata on public.property_valuations;
create trigger property_valuations_40_metadata before update on public.property_valuations
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists property_valuations_audit on public.property_valuations;
create trigger property_valuations_audit after insert or update or delete on public.property_valuations
for each row execute function app_private.audit_row_change('VALUATION','valuation_number');

drop trigger if exists property_valuation_comparables_10_validate on public.property_valuation_comparables;
create trigger property_valuation_comparables_10_validate before insert or update on public.property_valuation_comparables
for each row execute function app_private.validate_valuation_child();

drop trigger if exists property_valuation_comparables_40_metadata on public.property_valuation_comparables;
create trigger property_valuation_comparables_40_metadata before update on public.property_valuation_comparables
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists property_valuation_adjustments_10_validate on public.property_valuation_adjustments;
create trigger property_valuation_adjustments_10_validate before insert or update on public.property_valuation_adjustments
for each row execute function app_private.validate_valuation_child();

drop trigger if exists property_valuation_adjustments_40_metadata on public.property_valuation_adjustments;
create trigger property_valuation_adjustments_40_metadata before update on public.property_valuation_adjustments
for each row execute function app_private.set_standard_update_metadata();

grant select, insert, update on public.property_price_stages to authenticated;
grant select, insert, update on public.property_valuations to authenticated;
grant select, insert, update, delete on public.property_valuation_comparables to authenticated;
grant select, insert, update, delete on public.property_valuation_adjustments to authenticated;
grant usage, select on sequence public.valuation_number_seq to authenticated;
