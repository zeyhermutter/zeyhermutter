-- Thema 12 (Maklerpraxis): Case Studies, After-Sales und Empfehlungen.
--
-- Der abgeschlossene Fall endet heute mit dem Grundbucheintrag. Danach passiert
-- nichts mehr: keine Nachbetreuung, keine aufbereitete Referenz, keine
-- nachvollziehbare Empfehlungskette.
--
-- Drei Bausteine, alle auf vorhandenen Daten aufsetzend:
--   1. Die Case Study rechnet sich aus dem, was ohnehin erfasst ist. Gespeichert
--      wird nur, was niemand ableiten kann: die Erzaehlung, die Anonymisierung
--      und die getrennt dokumentierte Marketingfreigabe.
--   2. Die Nachbetreuung entsteht als Wiedervorlage in der bestehenden
--      Aufgabenverwaltung, nicht in einer zweiten To-do-Welt. Keine E-Mail.
--   3. Die Empfehlung wird als eigener Vorgang gefuehrt, weil sie vor dem Lead
--      beginnt. Die Herkunftszuordnung aus Thema 10 bleibt fuehrend fuer die
--      Kampagnenauswertung; Abweichungen werden benannt, nicht stillschweigend
--      zusammengerechnet.

-- ---------------------------------------------------------------------------
-- Rechte
-- ---------------------------------------------------------------------------
insert into public.permissions(key,description) values
  ('case_study.read','Case Studies lesen'),
  ('case_study.write','Case Studies bearbeiten'),
  ('case_study.approve','Marketingfreigabe einer Case Study entscheiden'),
  ('case_study.archive','Case Studies archivieren'),
  ('referral.read','Empfehlungen lesen'),
  ('referral.write','Empfehlungen bearbeiten'),
  ('referral.archive','Empfehlungen archivieren'),
  ('after_sales.manage','Nachbetreuungsfolge konfigurieren')
on conflict (key) do update set description=excluded.description;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('case_study.read','case_study.write','referral.read','referral.write')
where r.key in ('admin','managing_director','agent','assistance')
on conflict do nothing;

insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r
join public.permissions p on p.key in ('case_study.approve','case_study.archive','referral.archive','after_sales.manage')
where r.key in ('admin','managing_director')
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- 1. Case Study
-- ---------------------------------------------------------------------------
create sequence if not exists public.case_study_number_seq;

create table if not exists public.sale_case_studies (
  id uuid primary key default gen_random_uuid(),
  case_study_number text not null unique default ('ZM-CS-' || lpad(nextval('public.case_study_number_seq'::regclass)::text, 6, '0')),

  -- Eine Case Study gehoert zu genau einem abgeschlossenen Verkauf.
  sale_closing_id uuid not null unique
    constraint sale_case_studies_sale_closing_id_fkey references public.sale_closings(id) on delete restrict,

  title text not null,

  -- Die Erzaehlung. Alles hier ist Benutzertext; die Software formuliert nichts.
  initial_condition text,
  special_aspects text,
  lessons_learned text,
  customer_feedback text,
  customer_feedback_source text check (customer_feedback_source is null or customer_feedback_source in
    ('WRITTEN','VERBAL','REVIEW','SURVEY','OTHER')),
  customer_feedback_on date,

  -- Anonymisierung: Voreinstellung ist anonym, nicht identifizierbar.
  anonymized boolean not null default true,
  display_location text,

  -- Marketingfreigabe, getrennt von der Anonymisierung dokumentiert.
  release_status text not null default 'NOT_REQUESTED' check (release_status in
    ('NOT_REQUESTED','REQUESTED','GRANTED','DECLINED','WITHDRAWN')),
  release_scope text check (release_scope is null or release_scope in ('ANONYMIZED_ONLY','IDENTIFIABLE')),
  release_contact_id uuid constraint sale_case_studies_release_contact_id_fkey references public.contacts(id) on delete restrict,
  release_requested_on date,
  release_decided_on date,
  release_form text check (release_form is null or release_form in ('WRITTEN','EMAIL','VERBAL','CONTRACT')),
  release_document_id uuid constraint sale_case_studies_release_document_id_fkey references public.documents(id) on delete set null,
  release_note text,

  status text not null default 'DRAFT' check (status in ('DRAFT','INTERNAL','PUBLISHABLE','WITHDRAWN')),
  notes text,

  primary_responsible_user uuid constraint sale_case_studies_primary_responsible_user_fkey references public.profiles(user_id),
  created_at timestamptz not null default now(),
  created_by uuid constraint sale_case_studies_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint sale_case_studies_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  archived_at timestamptz,
  archived_by uuid constraint sale_case_studies_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),

  constraint sale_case_studies_requested_dated_check
    check (release_status <> 'REQUESTED' or release_requested_on is not null),
  constraint sale_case_studies_decided_dated_check
    check (release_status not in ('GRANTED','DECLINED','WITHDRAWN') or release_decided_on is not null),
  constraint sale_case_studies_granted_scope_check
    check (release_status <> 'GRANTED' or (release_scope is not null and release_contact_id is not null)),
  constraint sale_case_studies_publishable_release_check
    check (status <> 'PUBLISHABLE' or release_status = 'GRANTED'),
  constraint sale_case_studies_publishable_scope_check
    check (status <> 'PUBLISHABLE' or anonymized or release_scope = 'IDENTIFIABLE'),
  constraint sale_case_studies_feedback_dated_check
    check (coalesce(btrim(customer_feedback),'') = '' or customer_feedback_source is not null)
);

comment on table public.sale_case_studies is 'Aufbereitung eines abgeschlossenen Verkaufs. Die Kennzahlen werden nicht gespeichert, sondern aus den vorhandenen Daten gerechnet; hier steht nur, was niemand ableiten kann.';
comment on column public.sale_case_studies.anonymized is 'Voreinstellung wahr. Anonym heisst: ohne Namen und ohne genaue Adresse. Die Marketingfreigabe wird davon getrennt gefuehrt, weil auch eine anonyme Veroeffentlichung eine Freigabe braucht.';
comment on column public.sale_case_studies.release_scope is 'Worauf sich die erteilte Freigabe bezieht. IDENTIFIABLE ist Voraussetzung fuer eine nicht anonymisierte Veroeffentlichung.';
comment on column public.sale_case_studies.status is 'DRAFT in Arbeit, INTERNAL nur intern verwendbar, PUBLISHABLE nach erteilter Freigabe oeffentlich verwendbar, WITHDRAWN zurueckgezogen.';

create index if not exists sale_case_studies_closing_idx on public.sale_case_studies(sale_closing_id);
create index if not exists sale_case_studies_status_idx on public.sale_case_studies(status, release_status);
create index if not exists sale_case_studies_release_contact_idx on public.sale_case_studies(release_contact_id);
create index if not exists sale_case_studies_release_document_idx on public.sale_case_studies(release_document_id);
create index if not exists sale_case_studies_responsible_idx on public.sale_case_studies(primary_responsible_user);
create index if not exists sale_case_studies_created_by_idx on public.sale_case_studies(created_by);
create index if not exists sale_case_studies_updated_by_idx on public.sale_case_studies(updated_by);
create index if not exists sale_case_studies_archived_by_idx on public.sale_case_studies(archived_by);

-- Vorher/Nachher greift auf die vorhandene Objektmediathek zu; es werden keine
-- Dateien kopiert und keine zweite Medienverwaltung aufgebaut.
create table if not exists public.sale_case_study_media (
  id uuid primary key default gen_random_uuid(),
  case_study_id uuid not null
    constraint sale_case_study_media_case_study_id_fkey references public.sale_case_studies(id) on delete cascade,
  property_media_id uuid not null
    constraint sale_case_study_media_property_media_id_fkey references public.property_media(id) on delete restrict,
  media_role text not null check (media_role in ('BEFORE','AFTER')),
  caption text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid constraint sale_case_study_media_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint sale_case_study_media_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0),
  constraint sale_case_study_media_unique unique (case_study_id, property_media_id)
);

comment on table public.sale_case_study_media is 'Auswahl vorhandener Objektmedien als Vorher- und Nachher-Bild. Ein Medium wird nur dann oeffentlich verwendbar, wenn es in der Mediathek freigegeben ist.';

create index if not exists sale_case_study_media_case_study_idx on public.sale_case_study_media(case_study_id);
create index if not exists sale_case_study_media_property_media_idx on public.sale_case_study_media(property_media_id);
create index if not exists sale_case_study_media_created_by_idx on public.sale_case_study_media(created_by);
create index if not exists sale_case_study_media_updated_by_idx on public.sale_case_study_media(updated_by);

-- ---------------------------------------------------------------------------
-- 2. After-Sales: Vorlage der Nachbetreuungsfolge
-- ---------------------------------------------------------------------------
create table if not exists public.after_sales_step_templates (
  id uuid primary key default gen_random_uuid(),
  step_key text not null unique check (step_key ~ '^[A-Z][A-Z0-9_]{1,39}$'),
  title text not null,
  description text,
  audience text not null check (audience in ('BUYER','SELLER')),
  offset_days integer not null check (offset_days >= 0 and offset_days <= 3650),
  priority text not null default 'NORMAL' check (priority in ('LOW','NORMAL','HIGH','URGENT')),
  sort_order integer not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid constraint after_sales_step_templates_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint after_sales_step_templates_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  version bigint not null default 1 check (version > 0)
);

comment on table public.after_sales_step_templates is 'Bausteine der Nachbetreuungsfolge. Aus jedem aktiven Baustein entsteht nach der Uebergabe genau eine Wiedervorlage. Es werden keine E-Mails erzeugt.';
comment on column public.after_sales_step_templates.offset_days is 'Abstand zum Uebergabetermin in Tagen. Bewusst konfigurierbar, damit ein anderer Rhythmus keine Migration braucht.';

insert into public.after_sales_step_templates(step_key,title,description,audience,offset_days,priority,sort_order) values
  ('FOLLOW_UP','Nachfassen nach Übergabe','Kurzer Kontakt zum Käufer: Ist alles in Ordnung, sind Fragen offen geblieben?','BUYER',14,'NORMAL',10),
  ('REFERRAL_REQUEST','Empfehlungsanfrage','Beim Verkäufer nachfragen, ob er den Verkauf weiterempfehlen möchte. Das Ergebnis gehört als Empfehlung erfasst.','SELLER',45,'NORMAL',20),
  ('ANNIVERSARY','Jahrestag','Ein Jahr nach der Übergabe beim Käufer melden.','BUYER',365,'LOW',30)
on conflict (step_key) do nothing;

-- Die Wiedervorlage ist eine ganz normale Aufgabe. Zwei zusaetzliche Spalten
-- binden sie an den Abschluss und an ihren Baustein.
alter table public.tasks add column if not exists sale_closing_id uuid;
alter table public.tasks add column if not exists after_sales_step text;

do $$
begin
  if not exists (select 1 from pg_constraint where conname='tasks_sale_closing_id_fkey') then
    alter table public.tasks
      add constraint tasks_sale_closing_id_fkey
      foreign key (sale_closing_id) references public.sale_closings(id) on delete cascade;
  end if;
end
$$;

comment on column public.tasks.after_sales_step is 'Baustein der Nachbetreuungsfolge, aus dem diese Wiedervorlage entstanden ist. Verhindert zusammen mit sale_closing_id, dass dieselbe Nachbetreuung doppelt angelegt wird.';

create index if not exists tasks_sale_closing_idx on public.tasks(sale_closing_id);
create unique index if not exists tasks_after_sales_step_unique_idx
  on public.tasks(sale_closing_id, after_sales_step)
  where sale_closing_id is not null and after_sales_step is not null;

-- ---------------------------------------------------------------------------
-- 3. Empfehlungen
-- ---------------------------------------------------------------------------
create sequence if not exists public.referral_number_seq;

create table if not exists public.referrals (
  id uuid primary key default gen_random_uuid(),
  referral_number text not null unique default ('ZM-EM-' || lpad(nextval('public.referral_number_seq'::regclass)::text, 6, '0')),

  -- Wer empfiehlt: entweder eine Person oder eine Organisation, nie beides.
  referrer_contact_id uuid constraint referrals_referrer_contact_id_fkey references public.contacts(id) on delete restrict,
  referrer_organization_id uuid constraint referrals_referrer_organization_id_fkey references public.organizations(id) on delete restrict,

  -- Wen: der Kontakt, falls schon angelegt, sonst der blosse Name.
  referred_contact_id uuid constraint referrals_referred_contact_id_fkey references public.contacts(id) on delete set null,
  referred_name text,
  referred_note text,

  occasion text,
  source_closing_id uuid constraint referrals_source_closing_id_fkey references public.sale_closings(id) on delete set null,
  received_on date not null default current_date,
  channel text check (channel is null or channel in ('PHONE','EMAIL','IN_PERSON','WEB_FORM','LETTER','EVENT','OTHER')),

  status text not null default 'OPEN' check (status in ('OPEN','CONTACTED','DECLINED','LEAD_CREATED','WON','LOST')),
  resulting_lead_id uuid constraint referrals_resulting_lead_id_fkey references public.leads(id) on delete set null,
  outcome_note text,

  acknowledged_on date,
  acknowledgement_kind text check (acknowledgement_kind is null or acknowledgement_kind in
    ('THANK_YOU_NOTE','CALL','GIFT','FEE','NONE')),

  notes text,
  primary_responsible_user uuid constraint referrals_primary_responsible_user_fkey references public.profiles(user_id),
  created_at timestamptz not null default now(),
  created_by uuid constraint referrals_created_by_fkey references public.profiles(user_id) default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid constraint referrals_updated_by_fkey references public.profiles(user_id) default auth.uid(),
  archived_at timestamptz,
  archived_by uuid constraint referrals_archived_by_fkey references public.profiles(user_id),
  version bigint not null default 1 check (version > 0),

  constraint referrals_referrer_side_check
    check (num_nonnulls(referrer_contact_id, referrer_organization_id) = 1),
  constraint referrals_referred_side_check
    check (referred_contact_id is not null or coalesce(btrim(referred_name),'') <> ''),
  constraint referrals_lead_status_check
    check (resulting_lead_id is null or status in ('LEAD_CREATED','WON','LOST')),
  constraint referrals_declined_reason_check
    check (status <> 'DECLINED' or coalesce(btrim(outcome_note),'') <> ''),
  constraint referrals_acknowledgement_dated_check
    check (acknowledgement_kind is null or acknowledged_on is not null)
);

comment on table public.referrals is 'Eine Empfehlung beginnt vor dem Lead und kann ohne Lead enden. Sie wird deshalb eigenstaendig gefuehrt. Fuer die Kampagnen- und Partnerauswertung bleibt lead_acquisitions fuehrend.';
comment on column public.referrals.resulting_lead_id is 'Der Lead, der aus der Empfehlung entstanden ist. Die Herkunftszuordnung des Leads wird davon nicht automatisch gesetzt; Abweichungen weist public.referral_attribution_gaps aus.';

create index if not exists referrals_referrer_contact_idx on public.referrals(referrer_contact_id);
create index if not exists referrals_referrer_organization_idx on public.referrals(referrer_organization_id);
create index if not exists referrals_referred_contact_idx on public.referrals(referred_contact_id);
create index if not exists referrals_source_closing_idx on public.referrals(source_closing_id);
create index if not exists referrals_resulting_lead_idx on public.referrals(resulting_lead_id);
create index if not exists referrals_status_idx on public.referrals(status, received_on);
create index if not exists referrals_responsible_idx on public.referrals(primary_responsible_user);
create index if not exists referrals_created_by_idx on public.referrals(created_by);
create index if not exists referrals_updated_by_idx on public.referrals(updated_by);
create index if not exists referrals_archived_by_idx on public.referrals(archived_by);

-- ---------------------------------------------------------------------------
-- Kennzahlen der Case Study: gerechnet, nicht gespeichert
-- ---------------------------------------------------------------------------
create or replace function public.sale_case_study_facts(p_case_study_id uuid)
returns jsonb
language plpgsql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_case public.sale_case_studies%rowtype;
  v_closing public.sale_closings%rowtype;
  v_property_id uuid;
  v_check_id uuid;
  v_marketing_start date;
  v_preparation_start date;
  v_initial_price numeric;
  v_estimate numeric;
  v_valuation_low numeric;
  v_valuation_high numeric;
  v_invested numeric;
  v_measures integer;
  v_inquiries integer;
  v_viewings integer;
  v_offers integer;
  v_sale_end date;
begin
  select * into v_case from public.sale_case_studies where id = p_case_study_id;
  if v_case.id is null then
    return '{}'::jsonb;
  end if;

  select * into v_closing from public.sale_closings where id = v_case.sale_closing_id;
  v_property_id := v_closing.property_id;

  -- Vermarktungsstart ist der Beginn der ersten Preisstufe. Das ist dieselbe
  -- Definition, mit der die Preisstrategie aus Thema 7 "Tage im Markt" rechnet.
  select min(effective_from) into v_marketing_start
    from public.property_price_stages where property_id = v_property_id;
  select price into v_initial_price
    from public.property_price_stages where property_id = v_property_id
    order by effective_from limit 1;

  -- Aufbereitung beginnt mit dem Maklerauftrag, ersatzweise mit dem Projekt.
  select min(x) into v_preparation_start from (
    select min(m.term_start) as x from public.brokerage_mandates m
      where m.property_id = v_property_id and m.archived_at is null
    union all
    select min(sp.created_at::date) from public.sale_projects sp
      where sp.property_id = v_property_id
  ) s;

  select sp.current_price_estimate into v_estimate
    from public.sale_projects sp where sp.property_id = v_property_id
    order by sp.created_at limit 1;

  select v.range_from, v.range_to into v_valuation_low, v_valuation_high
    from public.property_valuations v
   where v.property_id = v_property_id and v.archived_at is null
   order by v.valued_on desc nulls last limit 1;

  select c.id into v_check_id
    from public.lead_sales_readiness_checks c
    join public.sale_projects sp on sp.id = c.sale_project_id
   where sp.property_id = v_property_id
   order by c.revision_no desc limit 1;

  if v_check_id is not null then
    select count(*), coalesce(sum(coalesce(m.actual_cost, m.approved_budget, 0)), 0)
      into v_measures, v_invested
      from public.lead_sales_readiness_measures m
     where m.check_id = v_check_id
       and m.decision not in ('NOT_RECOMMENDED','NOT_REQUIRED')
       and m.status in ('DONE','CHECKED');
  else
    v_measures := 0;
    v_invested := 0;
  end if;

  select count(*) into v_inquiries from public.inquiries
   where property_id = v_property_id and archived_at is null;
  select count(*) into v_viewings from public.viewings
   where property_id = v_property_id and archived_at is null;
  select count(*) into v_offers from public.purchase_offers
   where property_id = v_property_id and archived_at is null;

  v_sale_end := coalesce(v_closing.notarized_date, v_closing.purchase_price_paid_date, v_closing.handover_date);

  return jsonb_build_object(
    'property_id', v_property_id,
    'closing_number', v_closing.closing_number,
    'preparation_start', v_preparation_start,
    'marketing_start', v_marketing_start,
    'preparation_days', case when v_preparation_start is not null and v_marketing_start is not null
                             then greatest(v_marketing_start - v_preparation_start, 0) end,
    'marketing_days', case when v_marketing_start is not null and v_sale_end is not null
                           then greatest(v_sale_end - v_marketing_start, 0) end,
    'initial_price', v_initial_price,
    'price_estimate', v_estimate,
    'valuation_from', v_valuation_low,
    'valuation_to', v_valuation_high,
    'sale_price', coalesce(v_closing.notarial_purchase_price, v_closing.agreed_purchase_price),
    'invested', v_invested,
    'measures_done', v_measures,
    'inquiries', v_inquiries,
    'viewings', v_viewings,
    'offers', v_offers,
    'notarized_date', v_closing.notarized_date,
    'handover_date', v_closing.handover_date
  );
end;
$function$;

revoke execute on function public.sale_case_study_facts(uuid) from anon;
grant execute on function public.sale_case_study_facts(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Was einer Case Study zur Veroeffentlichung fehlt
-- ---------------------------------------------------------------------------
create or replace function public.sale_case_study_gaps(p_case_study_id uuid)
returns text[]
language plpgsql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
declare
  v_case public.sale_case_studies%rowtype;
  v_gaps text[] := '{}'::text[];
  v_count integer;
begin
  select * into v_case from public.sale_case_studies where id = p_case_study_id;
  if v_case.id is null then
    return array['Diese Case Study ist nicht erfasst.'];
  end if;

  if v_case.release_status <> 'GRANTED' then
    v_gaps := array_append(v_gaps, case v_case.release_status
      when 'NOT_REQUESTED' then 'Die Marketingfreigabe wurde noch nicht angefragt.'
      when 'REQUESTED' then 'Die Marketingfreigabe ist angefragt, aber noch nicht entschieden.'
      when 'DECLINED' then 'Die Marketingfreigabe wurde abgelehnt.'
      else 'Die Marketingfreigabe wurde zurückgezogen.' end);
  elsif not v_case.anonymized and v_case.release_scope <> 'IDENTIFIABLE' then
    v_gaps := array_append(v_gaps, 'Die Freigabe gilt nur anonymisiert, die Case Study ist aber nicht anonymisiert.');
  end if;

  select count(*) into v_count
    from public.sale_case_study_media csm
    join public.property_media pm on pm.id = csm.property_media_id
   where csm.case_study_id = p_case_study_id and not pm.public_approved;
  if v_count > 0 then
    v_gaps := array_append(v_gaps, v_count || case when v_count = 1
      then ' ausgewähltes Bild ist in der Mediathek nicht öffentlich freigegeben.'
      else ' ausgewählte Bilder sind in der Mediathek nicht öffentlich freigegeben.' end);
  end if;

  if coalesce(btrim(v_case.initial_condition),'') = '' then
    v_gaps := array_append(v_gaps, 'Der Ausgangszustand ist nicht beschrieben.');
  end if;

  if v_case.anonymized and coalesce(btrim(v_case.display_location),'') = '' then
    v_gaps := array_append(v_gaps, 'Für die anonymisierte Fassung fehlt eine Ortsangabe ohne Adresse.');
  end if;

  return v_gaps;
end;
$function$;

revoke execute on function public.sale_case_study_gaps(uuid) from anon;
grant execute on function public.sale_case_study_gaps(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Empfehlungsauswertung
-- ---------------------------------------------------------------------------
create or replace function public.referral_performance(p_from date default null, p_to date default null)
returns table (
  referrer_kind text,
  referrer_id uuid,
  referrer_label text,
  referrals bigint,
  contacted bigint,
  leads bigint,
  won bigint,
  lost bigint,
  declined bigint,
  acknowledged bigint,
  last_referral_on date
)
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
  select
    case when r.referrer_organization_id is not null then 'ORGANIZATION' else 'CONTACT' end as referrer_kind,
    coalesce(r.referrer_organization_id, r.referrer_contact_id) as referrer_id,
    coalesce(o.name, c.last_name || ', ' || c.first_name, 'Unbekannt') as referrer_label,
    count(*) as referrals,
    count(*) filter (where r.status <> 'OPEN') as contacted,
    count(*) filter (where r.resulting_lead_id is not null) as leads,
    count(*) filter (where r.status = 'WON') as won,
    count(*) filter (where r.status = 'LOST') as lost,
    count(*) filter (where r.status = 'DECLINED') as declined,
    count(*) filter (where r.acknowledged_on is not null) as acknowledged,
    max(r.received_on) as last_referral_on
  from public.referrals r
  left join public.organizations o on o.id = r.referrer_organization_id
  left join public.contacts c on c.id = r.referrer_contact_id
  where r.archived_at is null
    and (p_from is null or r.received_on >= p_from)
    and (p_to is null or r.received_on <= p_to)
  group by 1,2,3
  order by 4 desc, 3;
$function$;

revoke execute on function public.referral_performance(date,date) from anon;
grant execute on function public.referral_performance(date,date) to authenticated;

-- Wo Empfehlung und Herkunftszuordnung auseinanderlaufen. Das System benennt
-- den Unterschied; es rechnet nichts still zusammen und korrigiert nichts.
create or replace function public.referral_attribution_gaps()
returns table (
  referral_id uuid,
  referral_number text,
  lead_id uuid,
  lead_number text,
  referral_referrer text,
  acquisition_referrer text,
  reason text
)
language sql
stable
security invoker
set search_path to 'public','pg_temp'
as $function$
  select
    r.id,
    r.referral_number,
    l.id,
    l.lead_number,
    coalesce(ro.name, rc.last_name || ', ' || rc.first_name),
    coalesce(ao.name, ac.last_name || ', ' || ac.first_name),
    case when la.id is null
      then 'Zum Lead ist keine Herkunft erfasst; die Empfehlung erscheint in keiner Partnerauswertung.'
      else 'Die Herkunft des Leads nennt einen anderen Empfehlenden als die Empfehlung.' end
  from public.referrals r
  join public.leads l on l.id = r.resulting_lead_id
  left join public.lead_acquisitions la on la.lead_id = l.id
  left join public.organizations ro on ro.id = r.referrer_organization_id
  left join public.contacts rc on rc.id = r.referrer_contact_id
  left join public.organizations ao on ao.id = la.referrer_organization_id
  left join public.contacts ac on ac.id = la.referrer_contact_id
  where r.archived_at is null
    and (
      la.id is null
      or coalesce(la.referrer_organization_id, la.referrer_contact_id)
         is distinct from coalesce(r.referrer_organization_id, r.referrer_contact_id)
    )
  order by r.received_on desc;
$function$;

revoke execute on function public.referral_attribution_gaps() from anon;
grant execute on function public.referral_attribution_gaps() to authenticated;

-- ---------------------------------------------------------------------------
-- Regeln
-- ---------------------------------------------------------------------------
create or replace function app_private.validate_sale_case_study()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_closing public.sale_closings%rowtype;
  v_open integer;
begin
  select * into v_closing from public.sale_closings where id = new.sale_closing_id;
  if v_closing.id is null then
    raise exception 'CASE_STUDY_CLOSING_NOT_FOUND' using errcode = 'P0002';
  end if;
  -- Vor der Beurkundung gibt es keinen Fall, ueber den sich berichten liesse.
  if v_closing.notarized_date is null then
    raise exception 'CASE_STUDY_CLOSING_NOT_NOTARIZED' using errcode = '22023';
  end if;

  -- Die Freigabe muss von jemandem kommen, der am Fall beteiligt war.
  if new.release_contact_id is not null
     and new.release_contact_id <> v_closing.buyer_contact_id
     and not exists (select 1 from public.property_owners po
                      where po.property_id = v_closing.property_id
                        and po.contact_id = new.release_contact_id) then
    raise exception 'CASE_STUDY_RELEASE_CONTACT_UNRELATED' using errcode = '22023';
  end if;

  if tg_op = 'UPDATE'
     and old.release_status is distinct from new.release_status
     and new.release_status in ('GRANTED','DECLINED','WITHDRAWN')
     and not app_private.has_permission('case_study.approve') then
    raise exception 'CASE_STUDY_APPROVE_REQUIRED' using errcode = '42501';
  end if;

  -- Oeffentlich verwendbar nur mit freigegebenen Bildern.
  if new.status = 'PUBLISHABLE' then
    select count(*) into v_open
      from public.sale_case_study_media csm
      join public.property_media pm on pm.id = csm.property_media_id
     where csm.case_study_id = new.id and not pm.public_approved;
    if v_open > 0 then
      raise exception 'CASE_STUDY_MEDIA_NOT_RELEASED' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$function$;

create or replace function app_private.validate_sale_case_study_media()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_property_id uuid;
  v_media_property uuid;
  v_status text;
  v_approved boolean;
begin
  select c.property_id, cs.status into v_property_id, v_status
    from public.sale_case_studies cs
    join public.sale_closings c on c.id = cs.sale_closing_id
   where cs.id = new.case_study_id;
  if v_property_id is null then
    raise exception 'CASE_STUDY_NOT_FOUND' using errcode = 'P0002';
  end if;

  select pm.property_id, pm.public_approved into v_media_property, v_approved
    from public.property_media pm where pm.id = new.property_media_id;
  if v_media_property is null then
    raise exception 'CASE_STUDY_MEDIA_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_media_property <> v_property_id then
    raise exception 'CASE_STUDY_MEDIA_FOREIGN_PROPERTY' using errcode = '22023';
  end if;
  -- In eine bereits oeffentlich verwendbare Case Study kommt kein
  -- unfreigegebenes Bild nachtraeglich hinein.
  if v_status = 'PUBLISHABLE' and not v_approved then
    raise exception 'CASE_STUDY_MEDIA_NOT_RELEASED' using errcode = '22023';
  end if;
  return new;
end;
$function$;

create or replace function app_private.validate_referral()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
begin
  if new.status in ('LEAD_CREATED','WON','LOST') and new.resulting_lead_id is null then
    raise exception 'REFERRAL_STATUS_NEEDS_LEAD' using errcode = '22023';
  end if;
  if new.referred_contact_id is not null
     and new.referred_contact_id = new.referrer_contact_id then
    raise exception 'REFERRAL_SELF_REFERENCE' using errcode = '22023';
  end if;
  if new.received_on > current_date then
    raise exception 'REFERRAL_RECEIVED_IN_FUTURE' using errcode = '22023';
  end if;
  if new.acknowledged_on is not null and new.acknowledged_on < new.received_on then
    raise exception 'REFERRAL_ACKNOWLEDGED_BEFORE_RECEIVED' using errcode = '22023';
  end if;
  return new;
end;
$function$;

-- Die Nachbetreuungsfolge entsteht mit der Uebergabe. Sie erzeugt
-- Wiedervorlagen, sonst nichts.
create or replace function app_private.generate_after_sales_followups()
returns trigger
language plpgsql
set search_path to 'app_private','public','pg_temp'
as $function$
declare
  v_closing public.sale_closings%rowtype;
  v_seller uuid;
  v_template record;
  v_contact uuid;
begin
  if new.handover_at is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.handover_at is not null then
    return new;
  end if;

  select * into v_closing from public.sale_closings where id = new.sale_closing_id;
  if v_closing.id is null then
    return new;
  end if;

  select po.contact_id into v_seller
    from public.property_owners po
   where po.property_id = v_closing.property_id
   order by po.primary_contact desc, po.ownership_percentage desc nulls last, po.created_at
   limit 1;

  for v_template in
    select * from public.after_sales_step_templates where active order by sort_order, step_key
  loop
    v_contact := case when v_template.audience = 'SELLER' then v_seller else v_closing.buyer_contact_id end;
    -- Ohne Ansprechpartner entsteht keine Aufgabe; eine Wiedervorlage ohne
    -- Adressaten waere eine leere Erinnerung.
    if v_contact is not null then
      insert into public.tasks(title, description, due_at, responsible_user, contact_id,
                               property_id, sale_closing_id, after_sales_step, priority)
      values (v_template.title,
              v_template.description,
              (new.handover_at + make_interval(days => v_template.offset_days)),
              v_closing.primary_responsible_user,
              v_contact,
              v_closing.property_id,
              v_closing.id,
              v_template.step_key,
              v_template.priority)
      on conflict do nothing;
    end if;
  end loop;

  return new;
end;
$function$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.sale_case_studies enable row level security;

drop policy if exists sale_case_studies_select on public.sale_case_studies;
create policy sale_case_studies_select on public.sale_case_studies for select to authenticated
using ((select app_private.has_permission('case_study.read')));

drop policy if exists sale_case_studies_insert on public.sale_case_studies;
create policy sale_case_studies_insert on public.sale_case_studies for insert to authenticated
with check ((select app_private.has_permission('case_study.write')) and created_by = (select auth.uid()));

drop policy if exists sale_case_studies_update on public.sale_case_studies;
create policy sale_case_studies_update on public.sale_case_studies for update to authenticated
using ((select app_private.has_permission('case_study.write')))
with check ((select app_private.has_permission('case_study.write')));

alter table public.sale_case_study_media enable row level security;

drop policy if exists sale_case_study_media_select on public.sale_case_study_media;
create policy sale_case_study_media_select on public.sale_case_study_media for select to authenticated
using ((select app_private.has_permission('case_study.read')));

drop policy if exists sale_case_study_media_insert on public.sale_case_study_media;
create policy sale_case_study_media_insert on public.sale_case_study_media for insert to authenticated
with check ((select app_private.has_permission('case_study.write')) and created_by = (select auth.uid()));

drop policy if exists sale_case_study_media_update on public.sale_case_study_media;
create policy sale_case_study_media_update on public.sale_case_study_media for update to authenticated
using ((select app_private.has_permission('case_study.write')))
with check ((select app_private.has_permission('case_study.write')));

drop policy if exists sale_case_study_media_delete on public.sale_case_study_media;
create policy sale_case_study_media_delete on public.sale_case_study_media for delete to authenticated
using ((select app_private.has_permission('case_study.write')));

alter table public.after_sales_step_templates enable row level security;

drop policy if exists after_sales_step_templates_select on public.after_sales_step_templates;
create policy after_sales_step_templates_select on public.after_sales_step_templates for select to authenticated
using ((select app_private.has_permission('closing.read')));

drop policy if exists after_sales_step_templates_insert on public.after_sales_step_templates;
create policy after_sales_step_templates_insert on public.after_sales_step_templates for insert to authenticated
with check ((select app_private.has_permission('after_sales.manage')) and created_by = (select auth.uid()));

drop policy if exists after_sales_step_templates_update on public.after_sales_step_templates;
create policy after_sales_step_templates_update on public.after_sales_step_templates for update to authenticated
using ((select app_private.has_permission('after_sales.manage')))
with check ((select app_private.has_permission('after_sales.manage')));

alter table public.referrals enable row level security;

drop policy if exists referrals_select on public.referrals;
create policy referrals_select on public.referrals for select to authenticated
using ((select app_private.has_permission('referral.read')));

drop policy if exists referrals_insert on public.referrals;
create policy referrals_insert on public.referrals for insert to authenticated
with check ((select app_private.has_permission('referral.write')) and created_by = (select auth.uid()));

drop policy if exists referrals_update on public.referrals;
create policy referrals_update on public.referrals for update to authenticated
using ((select app_private.has_permission('referral.write')))
with check ((select app_private.has_permission('referral.write')));

-- ---------------------------------------------------------------------------
-- Trigger
-- ---------------------------------------------------------------------------
drop trigger if exists sale_case_studies_10_validate on public.sale_case_studies;
create trigger sale_case_studies_10_validate before insert or update on public.sale_case_studies
for each row execute function app_private.validate_sale_case_study();

drop trigger if exists sale_case_studies_20_archive_guard on public.sale_case_studies;
create trigger sale_case_studies_20_archive_guard before update on public.sale_case_studies
for each row execute function app_private.enforce_archive_permission('case_study.archive');

drop trigger if exists sale_case_studies_40_metadata on public.sale_case_studies;
create trigger sale_case_studies_40_metadata before update on public.sale_case_studies
for each row execute function app_private.set_business_update_metadata();

drop trigger if exists sale_case_studies_90_audit on public.sale_case_studies;
create trigger sale_case_studies_90_audit after insert or update or delete on public.sale_case_studies
for each row execute function app_private.audit_row_change('CASE_STUDY','case_study_number');

drop trigger if exists sale_case_study_media_10_validate on public.sale_case_study_media;
create trigger sale_case_study_media_10_validate before insert or update on public.sale_case_study_media
for each row execute function app_private.validate_sale_case_study_media();

drop trigger if exists sale_case_study_media_40_metadata on public.sale_case_study_media;
create trigger sale_case_study_media_40_metadata before update on public.sale_case_study_media
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists sale_case_study_media_90_audit on public.sale_case_study_media;
create trigger sale_case_study_media_90_audit after insert or update or delete on public.sale_case_study_media
for each row execute function app_private.audit_row_change('CASE_STUDY_MEDIA','media_role');

drop trigger if exists after_sales_step_templates_40_metadata on public.after_sales_step_templates;
create trigger after_sales_step_templates_40_metadata before update on public.after_sales_step_templates
for each row execute function app_private.set_standard_update_metadata();

drop trigger if exists after_sales_step_templates_90_audit on public.after_sales_step_templates;
create trigger after_sales_step_templates_90_audit after insert or update or delete on public.after_sales_step_templates
for each row execute function app_private.audit_row_change('AFTER_SALES_STEP','step_key');

drop trigger if exists referrals_10_validate on public.referrals;
create trigger referrals_10_validate before insert or update on public.referrals
for each row execute function app_private.validate_referral();

drop trigger if exists referrals_20_archive_guard on public.referrals;
create trigger referrals_20_archive_guard before update on public.referrals
for each row execute function app_private.enforce_archive_permission('referral.archive');

drop trigger if exists referrals_40_metadata on public.referrals;
create trigger referrals_40_metadata before update on public.referrals
for each row execute function app_private.set_business_update_metadata();

drop trigger if exists referrals_90_audit on public.referrals;
create trigger referrals_90_audit after insert or update or delete on public.referrals
for each row execute function app_private.audit_row_change('REFERRAL','referral_number');

drop trigger if exists sale_handover_protocols_50_after_sales on public.sale_handover_protocols;
create trigger sale_handover_protocols_50_after_sales after insert or update on public.sale_handover_protocols
for each row execute function app_private.generate_after_sales_followups();

-- ---------------------------------------------------------------------------
-- Grants
-- ---------------------------------------------------------------------------
grant select, insert, update on public.sale_case_studies to authenticated;
grant select, insert, update, delete on public.sale_case_study_media to authenticated;
grant select, insert, update on public.after_sales_step_templates to authenticated;
grant select, insert, update on public.referrals to authenticated;
grant usage, select on sequence public.case_study_number_seq to authenticated;
grant usage, select on sequence public.referral_number_seq to authenticated;
