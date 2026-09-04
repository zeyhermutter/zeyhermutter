-- Thema 11 (Maklerpraxis): Das Verkaufsprojekt als zentrale Klammer.
--
-- Der Verkaufsstrategie-Check haengt bis heute am Lead. Das Projekt kommt als
-- eigener Datensatz dazu und haelt Eigentuemer, Immobilie, Check, Massnahmen,
-- Auftrag, Vermarktung und Abschluss zusammen.
--
-- Ausdruecklich ohne Bruch: die Lead-Bindung des Checks bleibt bestehen und
-- funktionsfaehig, die Projektbindung ist eine zusaetzliche, optionale Spalte.
-- Bestehende Checks werden migriert, nicht dupliziert.

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
insert into public.permissions(key,description) values
  ('project.read','Verkaufsprojekte lesen'),
  ('project.write','Verkaufsprojekte bearbeiten'),
  ('project.assign','Verantwortlichen eines Verkaufsprojekts aendern'),
  ('project.archive','Verkaufsprojekte archivieren')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('project.read','project.write')
where r.key in ('admin','managing_director','agent','assistance')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('project.assign','project.archive')
where r.key in ('admin','managing_director')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Das Projekt
-- ---------------------------------------------------------------------------
create sequence if not exists public.sale_project_number_seq;

create table if not exists public.sale_projects (
  id uuid primary key default gen_random_uuid(),
  project_number text not null unique default ('ZM-VP-' || lpad(nextval('public.sale_project_number_seq'::regclass)::text, 6, '0')),

  -- Der Eigentuemer macht das Projekt aus. Die Immobilie darf spaeter kommen,
  -- der Lead ist nur die Herkunft und kann fehlen.
  contact_id uuid not null constraint sale_projects_contact_id_fkey references public.contacts(id) on delete restrict,
  property_id uuid constraint sale_projects_property_id_fkey references public.properties(id) on delete set null,
  lead_id uuid constraint sale_projects_lead_id_fkey references public.leads(id) on delete set null,

  phase text not null default 'LEAD' check (phase in
    ('LEAD','OWNER_TALK','READINESS_CHECK','CONSULTATION','MANDATE','PREPARATION','MARKETING','NOTARY','COMPLETED')),
  status text not null default 'ACTIVE' check (status in ('ACTIVE','ON_HOLD','WON','LOST')),
  lost_reason text,

  next_step text,
  next_step_due_on date,
  next_step_user uuid constraint sale_projects_next_step_user_fkey references public.profiles(user_id),

  target_marketing_start date,
  current_price_estimate numeric(14,2) check (current_price_estimate is null or current_price_estimate >= 0),
  price_estimate_note text,
  follow_up_at timestamptz,
  notes text,

  primary_responsible_user uuid constraint sale_projects_primary_responsible_user_fkey references public.profiles(user_id),
  created_at timestamptz not null default now(),
  created_by uuid constraint sale_projects_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint sale_projects_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  archived_at timestamptz,
  archived_by uuid constraint sale_projects_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),

  constraint sale_projects_lost_reason_check check (status <> 'LOST' or coalesce(btrim(lost_reason),'') <> ''),
  constraint sale_projects_next_step_dated_check check (
    coalesce(btrim(next_step),'') = '' or next_step_due_on is not null
  )
);

comment on table public.sale_projects is 'Verkaufsprojekt als Klammer um Eigentuemer, Immobilie, Check, Massnahmen, Auftrag, Vermarktung und Abschluss. Die Lead-Bindung des Checks bleibt daneben bestehen.';
comment on column public.sale_projects.next_step is 'Der naechste Schritt im Klartext. Ohne Faelligkeit wird er nicht gespeichert, damit keine Aufgabe ohne Termin entsteht.';

-- Ein Objekt gehoert zu genau einem laufenden Projekt.
create unique index if not exists sale_projects_one_active_per_property_idx
  on public.sale_projects(property_id)
  where property_id is not null and archived_at is null and status in ('ACTIVE','ON_HOLD');

create index if not exists sale_projects_contact_idx on public.sale_projects(contact_id);
create index if not exists sale_projects_property_idx on public.sale_projects(property_id);
create index if not exists sale_projects_lead_idx on public.sale_projects(lead_id);
create index if not exists sale_projects_phase_idx on public.sale_projects(phase, status);
create index if not exists sale_projects_responsible_idx on public.sale_projects(primary_responsible_user);
create index if not exists sale_projects_next_step_user_idx on public.sale_projects(next_step_user);
create index if not exists sale_projects_created_by_idx on public.sale_projects(created_by);
create index if not exists sale_projects_updated_by_idx on public.sale_projects(updated_by);
create index if not exists sale_projects_archived_by_idx on public.sale_projects(archived_by);

-- ---------------------------------------------------------------------------
-- Die zusaetzliche, optionale Bindung des Checks
-- ---------------------------------------------------------------------------
alter table public.lead_sales_readiness_checks
  add column if not exists sale_project_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='lead_sales_readiness_checks_sale_project_id_fkey') then
    alter table public.lead_sales_readiness_checks
      add constraint lead_sales_readiness_checks_sale_project_id_fkey
      foreign key (sale_project_id) references public.sale_projects(id) on delete set null;
  end if;
end
$$;

comment on column public.lead_sales_readiness_checks.sale_project_id is 'Zusaetzliche Bindung an das Verkaufsprojekt. Die Lead-Bindung bleibt bestehen und bleibt fuehrend fuer die bestehenden Ansichten.';

create index if not exists lead_sales_readiness_checks_project_idx on public.lead_sales_readiness_checks(sale_project_id);

-- ---------------------------------------------------------------------------
-- Verfuegungsberechtigung: dieselbe Regel, jetzt einmal in der Datenbank
-- ---------------------------------------------------------------------------
create or replace function public.property_disposition_gaps(p_property_id uuid)
returns text[]
language plpgsql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_record public.property_dispositions%rowtype;
  v_gaps text[] := '{}'::text[];
  v_count integer;
  v_proof text;
begin
  select * into v_record from public.property_dispositions where property_id = p_property_id;
  if v_record.id is null then
    return array['Für diese Immobilie ist die Verfügungsberechtigung nicht erfasst.'];
  end if;

  if v_record.ownership_structure = 'UNKNOWN' then
    v_gaps := array_append(v_gaps, 'Die Eigentümerstellung ist nicht festgelegt.');
  end if;

  if v_record.inheritance_case then
    if v_record.succession_proof_type is null then
      v_gaps := array_append(v_gaps, 'Es ist nicht festgelegt, womit die Erbfolge nachgewiesen wird.');
    elsif v_record.succession_proof_issued_on is null then
      v_proof := case v_record.succession_proof_type
        when 'CERTIFICATE_OF_INHERITANCE' then 'Erbschein'
        when 'NOTARIAL_WILL' then 'Notarielles Testament mit Eröffnungsprotokoll'
        when 'EUROPEAN_CERTIFICATE' then 'Europäisches Nachlasszeugnis'
        when 'OTHER' then 'Sonstiger Nachweis'
        else 'Der Erbnachweis' end;
      v_gaps := array_append(v_gaps, v_proof || ' ist noch nicht erteilt.');
    end if;
    if not v_record.land_register_corrected then
      v_gaps := array_append(v_gaps, 'Die Grundbuchberichtigung ist nicht als erfolgt dokumentiert.');
    end if;
    if v_record.ownership_structure = 'COMMUNITY_OF_HEIRS'
       and not exists (select 1 from public.property_disposition_parties p
                        where p.disposition_id = v_record.id and p.archived_at is null and p.party_role = 'CO_HEIR') then
      v_gaps := array_append(v_gaps, 'Zur Erbengemeinschaft ist kein Miterbe erfasst.');
    end if;
  end if;

  if v_record.executor_appointed
     and not exists (select 1 from public.property_disposition_parties p
                      where p.disposition_id = v_record.id and p.archived_at is null and p.party_role = 'EXECUTOR') then
    v_gaps := array_append(v_gaps, 'Testamentsvollstreckung ist vermerkt, aber kein Vollstrecker erfasst.');
  end if;

  if v_record.spousal_consent_required and v_record.spousal_consent_given_on is null then
    v_gaps := array_append(v_gaps, 'Die erforderliche Ehegattenzustimmung liegt nicht vor.');
  end if;

  select count(*) into v_count from public.property_disposition_parties p
   where p.disposition_id = v_record.id and p.archived_at is null and p.consent_status = 'OPEN';
  if v_count > 0 then
    v_gaps := array_append(v_gaps, v_count || case when v_count = 1 then ' Zustimmung ist noch offen.' else ' Zustimmungen sind noch offen.' end);
  end if;

  select count(*) into v_count from public.property_disposition_parties p
   where p.disposition_id = v_record.id and p.archived_at is null and p.consent_status = 'REFUSED';
  if v_count > 0 then
    v_gaps := array_append(v_gaps, v_count || case when v_count = 1 then ' Zustimmung wurde verweigert.' else ' Zustimmungen wurden verweigert.' end);
  end if;

  select count(*) into v_count from public.property_disposition_parties p
   where p.disposition_id = v_record.id and p.archived_at is null
     and p.court_approval_required and p.court_approval_granted_on is null;
  if v_count > 0 then
    v_gaps := array_append(v_gaps, v_count || case when v_count = 1 then ' gerichtliche Genehmigung steht aus.' else ' gerichtliche Genehmigungen stehen aus.' end);
  end if;

  select count(*) into v_count from public.property_disposition_parties p
   where p.disposition_id = v_record.id and p.archived_at is null
     and p.party_role = 'ATTORNEY_IN_FACT' and p.power_of_attorney_revoked_on is not null;
  if v_count > 0 then
    v_gaps := array_append(v_gaps, v_count || case when v_count = 1 then ' Vollmacht ist widerrufen.' else ' Vollmachten sind widerrufen.' end);
  end if;

  select count(*) into v_count from public.property_disposition_parties p
   where p.disposition_id = v_record.id and p.archived_at is null
     and p.party_role = 'ATTORNEY_IN_FACT' and p.power_of_attorney_revoked_on is null
     and p.power_of_attorney_valid_until is not null and p.power_of_attorney_valid_until < current_date;
  if v_count > 0 then
    v_gaps := array_append(v_gaps, v_count || case when v_count = 1 then ' Vollmacht ist abgelaufen.' else ' Vollmachten sind abgelaufen.' end);
  end if;

  select count(*) into v_count from public.property_disposition_parties p
   where p.disposition_id = v_record.id and p.archived_at is null and p.is_minor
     and not exists (select 1 from public.property_disposition_parties c
                      where c.disposition_id = v_record.id and c.archived_at is null
                        and c.party_role = 'SUPPLEMENTARY_CURATOR' and c.represents_contact_id = p.contact_id);
  if v_count > 0 then
    v_gaps := array_append(v_gaps,
      'Für ' || v_count || case when v_count = 1 then ' minderjährige beteiligte Person ist' else ' minderjährige beteiligte Personen sind' end || ' kein Ergänzungspfleger erfasst.');
  end if;

  return v_gaps;
end;
$function$;

comment on function public.property_disposition_gaps(uuid) is 'Offene Punkte der Verfügungsberechtigung im Klartext. Reine Vollständigkeitsprüfung der Erfassung, keine rechtliche Beurteilung.';

revoke all on function public.property_disposition_gaps(uuid) from public;
revoke execute on function public.property_disposition_gaps(uuid) from anon;
grant execute on function public.property_disposition_gaps(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Blocker bis Vermarktungsstart, an einer Stelle zusammengefuehrt
-- ---------------------------------------------------------------------------
create or replace function public.sale_project_blockers(p_project_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_project public.sale_projects%rowtype;
  v_check_id uuid;
  v_blockers jsonb := '[]'::jsonb;
  v_text text;
  v_count integer;
begin
  select * into v_project from public.sale_projects where id = p_project_id;
  if v_project.id is null then
    return '[]'::jsonb;
  end if;

  if v_project.property_id is null then
    v_blockers := v_blockers || jsonb_build_object('area','PROPERTY','text','Dem Projekt ist noch keine Immobilie zugeordnet.');
  end if;

  -- Massnahmen aus dem aktuellen Verkaufsstrategie-Check
  select id into v_check_id from public.lead_sales_readiness_checks
   where sale_project_id = p_project_id and is_current order by revision_no desc limit 1;
  if v_check_id is null and v_project.lead_id is not null then
    select id into v_check_id from public.lead_sales_readiness_checks
     where lead_id = v_project.lead_id and is_current order by revision_no desc limit 1;
  end if;

  if v_check_id is null then
    v_blockers := v_blockers || jsonb_build_object('area','CHECK','text','Zum Projekt ist kein aktueller Verkaufsstrategie-Check erfasst.');
  else
    select count(*) into v_count from public.lead_sales_readiness_measures m
     where m.check_id = v_check_id
       and m.decision not in ('NOT_RECOMMENDED','NOT_REQUIRED')
       and m.status not in ('DONE','CHECKED','DISMISSED');
    if v_count > 0 then
      v_blockers := v_blockers || jsonb_build_object('area','MEASURE',
        'text', v_count || case when v_count = 1 then ' Maßnahme ist noch offen.' else ' Maßnahmen sind noch offen.' end);
    end if;
  end if;

  if v_project.property_id is not null then
    -- Pflicht-Checkliste der Vermarktungsreife
    select string_agg(item.title, ', ' order by item.category, item.title) into v_text
      from public.property_marketing_checklist_items item
     where item.property_id = v_project.property_id and item.required and item.status not in ('DONE','WAIVED');
    if v_text is not null then
      v_blockers := v_blockers || jsonb_build_object('area','CHECKLIST','text','Offene Pflichtpunkte: ' || v_text);
    end if;

    -- Pflichtangaben aus Thema 9
    select string_agg(g, ' ') into v_text from unnest(public.property_disclosure_gaps(v_project.property_id)) g;
    if v_text is not null then
      v_blockers := v_blockers || jsonb_build_object('area','DISCLOSURE','text',v_text);
    end if;

    -- Verfuegungsberechtigung aus Thema 5
    select string_agg(g, ' ') into v_text from unnest(public.property_disposition_gaps(v_project.property_id)) g;
    if v_text is not null then
      v_blockers := v_blockers || jsonb_build_object('area','DISPOSITION','text',v_text);
    end if;

    -- Maklerauftrag
    if not exists (select 1 from public.brokerage_mandates m
                    where m.property_id = v_project.property_id and m.archived_at is null and m.status = 'ACTIVE') then
      v_blockers := v_blockers || jsonb_build_object('area','MANDATE','text','Für die Immobilie ist kein aktiver Maklerauftrag erfasst.');
    end if;
  end if;

  return v_blockers;
end;
$function$;

comment on function public.sale_project_blockers(uuid) is 'Fuehrt die offenen Punkte bis zum Vermarktungsstart aus Massnahmen, Checkliste, Pflichtangaben, Verfuegungsberechtigung und Auftrag zusammen. Keine rechtliche Bewertung.';

revoke all on function public.sale_project_blockers(uuid) from public;
revoke execute on function public.sale_project_blockers(uuid) from anon;
grant execute on function public.sale_project_blockers(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Regeln
-- ---------------------------------------------------------------------------
create or replace function app_private.validate_sale_project()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if not exists (select 1 from public.contacts c where c.id = new.contact_id) then
    raise exception 'PROJECT_CONTACT_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.property_id is not null
     and not exists (select 1 from public.properties p where p.id = new.property_id) then
    raise exception 'PROJECT_PROPERTY_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.lead_id is not null
     and not exists (select 1 from public.leads l where l.id = new.lead_id) then
    raise exception 'PROJECT_LEAD_NOT_FOUND' using errcode = 'P0002';
  end if;
  if new.next_step_due_on is not null and new.next_step_due_on < current_date - 3650 then
    raise exception 'PROJECT_NEXT_STEP_UNREALISTIC' using errcode = '22023';
  end if;
  -- Ab der Vermarktungsphase gehoert eine Immobilie dazu; ohne sie zeigt das
  -- Projekt auf nichts, was vermarktet werden koennte.
  if new.phase in ('PREPARATION','MARKETING','NOTARY','COMPLETED') and new.property_id is null then
    raise exception 'PROJECT_PHASE_NEEDS_PROPERTY' using errcode = '22023';
  end if;
  if new.status = 'WON' and new.phase <> 'COMPLETED' then
    raise exception 'PROJECT_WON_NEEDS_COMPLETED_PHASE' using errcode = '22023';
  end if;
  if tg_op = 'UPDATE'
     and old.primary_responsible_user is distinct from new.primary_responsible_user
     and not app_private.has_permission('project.assign') then
    raise exception 'PROJECT_ASSIGN_REQUIRED' using errcode = '42501';
  end if;
  return new;
end;
$function$;

alter table public.sale_projects enable row level security;

drop policy if exists sale_projects_select on public.sale_projects;
create policy sale_projects_select on public.sale_projects for select to authenticated
using ((select app_private.has_permission('project.read')));

drop policy if exists sale_projects_insert on public.sale_projects;
create policy sale_projects_insert on public.sale_projects for insert to authenticated
with check ((select app_private.has_permission('project.write')) and created_by = (select auth.uid()));

drop policy if exists sale_projects_update on public.sale_projects;
create policy sale_projects_update on public.sale_projects for update to authenticated
using ((select app_private.has_permission('project.write')))
with check ((select app_private.has_permission('project.write')));

drop trigger if exists sale_projects_10_validate on public.sale_projects;
create trigger sale_projects_10_validate before insert or update on public.sale_projects
for each row execute function app_private.validate_sale_project();

drop trigger if exists sale_projects_20_archive_guard on public.sale_projects;
create trigger sale_projects_20_archive_guard before update on public.sale_projects
for each row execute function app_private.enforce_archive_permission('project.archive');

drop trigger if exists sale_projects_40_metadata on public.sale_projects;
create trigger sale_projects_40_metadata before update on public.sale_projects
for each row execute function app_private.set_business_update_metadata();

drop trigger if exists sale_projects_90_audit on public.sale_projects;
create trigger sale_projects_90_audit after insert or update or delete on public.sale_projects
for each row execute function app_private.audit_row_change('SALE_PROJECT','project_number');

grant select, insert, update on public.sale_projects to authenticated;
grant usage, select on sequence public.sale_project_number_seq to authenticated;

-- ---------------------------------------------------------------------------
-- Bestehende Checks migrieren: je vorhandener Lead-Check-Kombination ein
-- Projekt. Es wird nichts dupliziert und nichts geloescht.
-- ---------------------------------------------------------------------------
do $$
declare
  v_row record;
  v_project uuid;
begin
  for v_row in
    select distinct on (c.lead_id)
           c.lead_id, l.contact_id, l.converted_property_id, l.primary_responsible_user,
           l.status as lead_status, c.status as check_status, c.responsible_user,
           coalesce(c.updated_by, c.created_by, c.responsible_user, l.primary_responsible_user) as actor
      from public.lead_sales_readiness_checks c
      join public.leads l on l.id = c.lead_id
     where c.sale_project_id is null
     order by c.lead_id, c.revision_no desc
  loop
    -- Die Metadaten-Trigger der bestehenden Check-Tabelle erwarten einen
    -- handelnden Benutzer. In einer Migration gibt es keinen. Statt den
    -- Trigger zu umgehen, handelt hier der zuletzt an diesem Check taetige
    -- Benutzer; die Herkunft der Aenderung bleibt damit nachvollziehbar.
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_row.actor, 'role', 'authenticated')::text, true);

    insert into public.sale_projects(
      contact_id, property_id, lead_id, phase, status, lost_reason,
      primary_responsible_user, created_by, updated_by, notes)
    values (
      v_row.contact_id,
      v_row.converted_property_id,
      v_row.lead_id,
      case
        when v_row.converted_property_id is not null then 'PREPARATION'
        when v_row.check_status = 'FINALIZED' then 'CONSULTATION'
        else 'READINESS_CHECK'
      end,
      case when v_row.lead_status = 'LOST' then 'LOST' else 'ACTIVE' end,
      case when v_row.lead_status = 'LOST' then 'Aus dem Lead-Status „Verloren" übernommen.' else null end,
      coalesce(v_row.responsible_user, v_row.primary_responsible_user),
      coalesce(v_row.responsible_user, v_row.primary_responsible_user),
      coalesce(v_row.responsible_user, v_row.primary_responsible_user),
      'Aus dem bestehenden Verkaufsstrategie-Check übernommen.')
    returning id into v_project;

    update public.lead_sales_readiness_checks
       set sale_project_id = v_project
     where lead_id = v_row.lead_id and sale_project_id is null;
  end loop;
end
$$;
