-- Unterlagenmanagement je Objektakte.
--
-- Bisher konnte man Dokumente ablegen, aber nirgends festhalten, welche
-- Unterlage zu einem Objekt noch fehlt, bei wem sie angefordert wurde und ob
-- jemand sie geprueft hat. Genau das ist die Arbeit vor dem Vermarktungsstart.
--
-- Was diese Migration ausdruecklich NICHT tut: sie sagt nicht, welche Unterlage
-- fuer ein Objekt vorgeschrieben ist. Das waere eine Rechtsauskunft. Der
-- Vorlagenkatalog ist eine Arbeitsliste des Buros — er wird von Menschen
-- gepflegt, ist pro Zeile abschaltbar und wird nie automatisch auf eine Akte
-- angewandt; das Uebernehmen ist immer eine bewusste Handlung. "Fehlt" heisst
-- deshalb "steht auf unserer Liste und ist noch nicht da", nicht "ist
-- gesetzlich vorgeschrieben und fehlt".

-- 1. Vorlagenkatalog ---------------------------------------------------------

create table if not exists public.document_requirement_templates (
  id uuid primary key default gen_random_uuid(),
  template_key text not null unique,
  title text not null,
  document_category text,
  property_type text,
  transaction_type text,
  hint text,
  active boolean not null default true,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  version bigint not null default 1,
  constraint document_requirement_templates_title_check check (btrim(title) <> ''),
  constraint document_requirement_templates_transaction_check
    check (transaction_type is null or transaction_type = any (array['SALE','RENT'])),
  constraint document_requirement_templates_property_type_check
    check (property_type is null or property_type = any (array[
      'DETACHED_HOUSE','SEMI_DETACHED_HOUSE','TERRACED_HOUSE','APARTMENT_BUILDING','APARTMENT',
      'PENTHOUSE','MAISONETTE','LAND','COMMERCIAL','OFFICE','RETAIL','GARAGE','PARKING_SPACE','OTHER']))
);

comment on table public.document_requirement_templates is
  'Arbeitsliste des Buros: welche Unterlagen ueblicherweise zu einer Akte gehoeren. Keine Rechtsauskunft, keine Pflichtangabe.';

-- 2. Anforderungen je Objekt -------------------------------------------------

create table if not exists public.property_document_requirements (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  template_key text,
  title text not null,
  document_category text,
  status text not null default 'MISSING',
  document_id uuid references public.documents(id) on delete set null,
  responsible_contact_id uuid references public.contacts(id) on delete set null,
  requested_on date,
  received_on date,
  checked_on date,
  checked_by uuid references public.profiles(user_id) on delete set null,
  valid_until date,
  note text,
  sort_order integer not null default 100,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  version bigint not null default 1,
  constraint property_document_requirements_title_check check (btrim(title) <> ''),
  constraint property_document_requirements_status_check
    check (status = any (array['MISSING','REQUESTED','PRESENT','TO_CHECK','CHECKED','OUTDATED','NOT_APPLICABLE']))
);

comment on column public.property_document_requirements.status is
  'MISSING noch nicht da, REQUESTED angefordert, PRESENT vorhanden, TO_CHECK zu pruefen, CHECKED geprueft, OUTDATED veraltet, NOT_APPLICABLE nicht erforderlich.';

create unique index if not exists property_document_requirements_template_unique
  on public.property_document_requirements (property_id, template_key)
  where template_key is not null;

create index if not exists property_document_requirements_property_idx
  on public.property_document_requirements (property_id, sort_order);

create index if not exists property_document_requirements_document_idx
  on public.property_document_requirements (document_id)
  where document_id is not null;

create index if not exists property_document_requirements_responsible_idx
  on public.property_document_requirements (responsible_contact_id)
  where responsible_contact_id is not null;

create index if not exists property_document_requirements_checked_by_idx
  on public.property_document_requirements (checked_by)
  where checked_by is not null;

-- 3. Fachliche Pruefung ------------------------------------------------------
--
-- Geprueft wird nur, ob die erfassten Angaben zueinander passen: ein Datum in
-- der Zukunft, eine Pruefung vor dem Eingang, ein Dokument aus einer fremden
-- Akte. Ob eine Unterlage gebraucht wird, entscheidet diese Funktion nicht.

create or replace function app_private.validate_property_document_requirement()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document_property uuid;
begin
  new.title := btrim(new.title);

  if new.document_id is not null then
    select property_id into v_document_property from public.documents where id = new.document_id;
    if v_document_property is distinct from new.property_id then
      raise exception 'Das verknuepfte Dokument gehoert nicht zu dieser Immobilie.'
        using errcode = '23514';
    end if;
  end if;

  if new.requested_on is not null and new.requested_on > current_date then
    raise exception 'Das Anforderungsdatum darf nicht in der Zukunft liegen.' using errcode = '23514';
  end if;
  if new.received_on is not null and new.received_on > current_date then
    raise exception 'Das Eingangsdatum darf nicht in der Zukunft liegen.' using errcode = '23514';
  end if;
  if new.checked_on is not null and new.checked_on > current_date then
    raise exception 'Das Pruefdatum darf nicht in der Zukunft liegen.' using errcode = '23514';
  end if;
  if new.checked_on is not null and new.received_on is not null and new.checked_on < new.received_on then
    raise exception 'Die Pruefung kann nicht vor dem Eingang der Unterlage liegen.' using errcode = '23514';
  end if;

  if new.status = 'REQUESTED' and new.requested_on is null then
    raise exception 'Fuer den Stand "angefordert" fehlt das Anforderungsdatum.' using errcode = '23514';
  end if;
  if new.status in ('PRESENT','TO_CHECK','CHECKED','OUTDATED') and new.received_on is null then
    raise exception 'Fuer diesen Stand fehlt das Eingangsdatum der Unterlage.' using errcode = '23514';
  end if;
  if new.status = 'CHECKED' and new.checked_on is null then
    raise exception 'Fuer den Stand "geprueft" fehlt das Pruefdatum.' using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists property_document_requirement_validate on public.property_document_requirements;
create trigger property_document_requirement_validate
  before insert or update on public.property_document_requirements
  for each row execute function app_private.validate_property_document_requirement();

drop trigger if exists property_document_requirement_set_metadata on public.property_document_requirements;
create trigger property_document_requirement_set_metadata
  before update on public.property_document_requirements
  for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists property_document_requirement_audit on public.property_document_requirements;
create trigger property_document_requirement_audit
  after insert or delete or update on public.property_document_requirements
  for each row execute function app_private.audit_property_child('DOCUMENT_REQUIREMENT');

drop trigger if exists document_requirement_template_set_metadata on public.document_requirement_templates;
create trigger document_requirement_template_set_metadata
  before update on public.document_requirement_templates
  for each row execute function app_private.set_standard_update_metadata();

-- 4. Berechtigungen ----------------------------------------------------------

alter table public.document_requirement_templates enable row level security;
alter table public.property_document_requirements enable row level security;

drop policy if exists document_requirement_templates_select on public.document_requirement_templates;
create policy document_requirement_templates_select on public.document_requirement_templates
  for select using ((select app_private.has_permission('document.read')));

drop policy if exists document_requirement_templates_insert on public.document_requirement_templates;
create policy document_requirement_templates_insert on public.document_requirement_templates
  for insert with check ((select app_private.has_permission('document.write')));

drop policy if exists document_requirement_templates_update on public.document_requirement_templates;
create policy document_requirement_templates_update on public.document_requirement_templates
  for update using ((select app_private.has_permission('document.write')))
  with check ((select app_private.has_permission('document.write')));

drop policy if exists document_requirement_templates_delete on public.document_requirement_templates;
create policy document_requirement_templates_delete on public.document_requirement_templates
  for delete using ((select app_private.has_permission('document.write')));

drop policy if exists property_document_requirements_select on public.property_document_requirements;
create policy property_document_requirements_select on public.property_document_requirements
  for select using ((select app_private.has_permission('document.read')));

drop policy if exists property_document_requirements_insert on public.property_document_requirements;
create policy property_document_requirements_insert on public.property_document_requirements
  for insert with check ((select app_private.has_permission('document.write')));

drop policy if exists property_document_requirements_update on public.property_document_requirements;
create policy property_document_requirements_update on public.property_document_requirements
  for update using ((select app_private.has_permission('document.write')))
  with check ((select app_private.has_permission('document.write')));

drop policy if exists property_document_requirements_delete on public.property_document_requirements;
create policy property_document_requirements_delete on public.property_document_requirements
  for delete using ((select app_private.has_permission('document.write')));

grant select on public.document_requirement_templates to authenticated;
grant insert, update, delete on public.document_requirement_templates to authenticated;
grant select on public.property_document_requirements to authenticated;
grant insert, update, delete on public.property_document_requirements to authenticated;

-- 5. Vorlage auf eine Akte uebernehmen --------------------------------------
--
-- Bewusst eine Handlung des Benutzers, kein Automatismus beim Anlegen eines
-- Objekts. Bereits vorhandene Zeilen bleiben unangetastet.

create or replace function public.apply_document_requirement_templates(p_property_id uuid)
returns integer
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_property public.properties;
  v_count integer;
begin
  select * into v_property from public.properties where id = p_property_id;
  if v_property.id is null then
    raise exception 'Immobilie nicht gefunden.' using errcode = 'P0002';
  end if;

  insert into public.property_document_requirements
    (property_id, template_key, title, document_category, sort_order)
  select p_property_id, t.template_key, t.title, t.document_category, t.sort_order
  from public.document_requirement_templates t
  where t.active
    and (t.property_type is null or t.property_type = v_property.property_type)
    and (t.transaction_type is null or t.transaction_type = v_property.transaction_type)
    and not exists (
      select 1 from public.property_document_requirements r
      where r.property_id = p_property_id and r.template_key = t.template_key
    );

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

grant execute on function public.apply_document_requirement_templates(uuid) to authenticated;

-- 6. Ueberblick fuer eine Akte ----------------------------------------------
--
-- Als Funktion statt als Sicht, damit die Berechtigung des Aufrufers gilt und
-- der Advisor keine Sicht mit fremden Rechten meldet.

create or replace function public.property_document_requirement_summary(p_property_id uuid)
returns table (
  gesamt bigint,
  fehlend bigint,
  angefordert bigint,
  vorhanden bigint,
  zu_pruefen bigint,
  geprueft bigint,
  veraltet bigint,
  nicht_erforderlich bigint
)
language sql
security invoker
stable
set search_path = public, pg_temp
as $$
  select
    count(*),
    count(*) filter (where status = 'MISSING'),
    count(*) filter (where status = 'REQUESTED'),
    count(*) filter (where status in ('PRESENT','TO_CHECK','CHECKED')),
    count(*) filter (where status = 'TO_CHECK'),
    count(*) filter (where status = 'CHECKED'),
    count(*) filter (where status = 'OUTDATED'
      or (status <> 'NOT_APPLICABLE' and valid_until is not null and valid_until < current_date)),
    count(*) filter (where status = 'NOT_APPLICABLE')
  from public.property_document_requirements
  where property_id = p_property_id;
$$;

grant execute on function public.property_document_requirement_summary(uuid) to authenticated;

-- 7. Erste Fuellung des Katalogs --------------------------------------------
--
-- Diese Zeilen bilden ab, welche Unterlagenarten das System ohnehin kennt: sie
-- entsprechen den Kategorien der Dokumentenablage. Sie sind eine Arbeitsliste,
-- keine Aussage darueber, was vorgeschrieben ist. Jede Zeile laesst sich
-- abschalten, umbenennen oder loeschen, und keine Zeile landet von selbst in
-- einer Akte. Bei erneutem Einspielen bleiben bestehende Zeilen unveraendert,
-- damit die Pflege des Buros nicht ueberschrieben wird.

insert into public.document_requirement_templates
  (template_key, title, document_category, sort_order, hint)
values
  ('LAND_REGISTER',            'Grundbuchauszug',                'LAND_REGISTER',            10, 'Aktueller Auszug, nicht aelter als der laufende Vorgang.'),
  ('CADASTRAL_MAP',            'Flurkarte / Lageplan',           'CADASTRAL_MAP',            20, null),
  ('FLOOR_PLAN',               'Grundrisse',                     'FLOOR_PLAN',               30, 'Fuer Expose und Besichtigung.'),
  ('LIVING_AREA_CALCULATION',  'Wohnflaechenberechnung',         'LIVING_AREA_CALCULATION',  40, 'Grundlage der Flaechenangabe in der Objektakte.'),
  ('ENERGY_CERTIFICATE',       'Energieausweis',                 'ENERGY_CERTIFICATE',       50, 'Gueltig bis eintragen — die Akte warnt beim Ablauf.'),
  ('DECLARATION_OF_DIVISION',  'Teilungserklaerung',             'DECLARATION_OF_DIVISION',  60, 'Bei Eigentumswohnungen. Sonst "nicht erforderlich".'),
  ('WEG',                      'WEG-Unterlagen',                 'WEG',                      70, 'Bei Eigentumswohnungen. Sonst "nicht erforderlich".'),
  ('MINUTES',                  'Protokolle der Eigentuemerversammlung', 'MINUTES',            80, 'Ueblicherweise die letzten drei Jahre.'),
  ('BUSINESS_PLAN',            'Wirtschaftsplan',                'BUSINESS_PLAN',            90, null),
  ('SERVICE_CHARGE_STATEMENT', 'Betriebskostenabrechnung',       'SERVICE_CHARGE_STATEMENT', 100, null),
  ('BUILDING_DOCUMENTS',       'Bauunterlagen',                  'BUILDING_DOCUMENTS',       110, 'Baubeschreibung, Baugenehmigung, Schnitte.'),
  ('BUILDING_ENCUMBRANCE',     'Baulastenauskunft',              'BUILDING_ENCUMBRANCE_REGISTER', 120, null),
  ('CONTAMINATION',            'Altlastenauskunft',              'CONTAMINATION_REGISTER',   130, null),
  ('TENANCY_AGREEMENT',        'Mietvertraege',                  'TENANCY_AGREEMENT',        140, 'Bei vermieteten Objekten. Sonst "nicht erforderlich".'),
  ('SUCCESSION_PROOF',         'Erbnachweis',                    'SUCCESSION_PROOF',         150, 'Bei Erbengemeinschaften. Sonst "nicht erforderlich".'),
  ('POWER_OF_ATTORNEY',        'Vollmacht',                      'POWER_OF_ATTORNEY',        160, 'Wenn nicht der Eigentuemer selbst handelt.'),
  ('BROKERAGE_AGREEMENT',      'Maklervertrag',                  'BROKERAGE_AGREEMENT',      170, null),
  ('PHOTOS',                   'Objektfotos',                    'PHOTOS',                   180, 'Fuer Expose und Portale.')
on conflict (template_key) do nothing;
