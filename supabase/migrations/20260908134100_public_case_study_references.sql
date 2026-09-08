-- Referenzen auf der oeffentlichen Webseite.
--
-- Die Fallstudien tragen die Einwilligung bereits: sale_case_studies_publishable_release_check
-- erlaubt status='PUBLISHABLE' nur bei release_status='GRANTED', und
-- sale_case_studies_publishable_scope_check verlangt dafuer entweder
-- Anonymisierung oder eine ausdrueckliche Freigabe unter Namen.
--
-- Was fehlt, ist der Unterschied zwischen zwei Dingen, die nicht dasselbe sind:
--   PUBLISHABLE       = darf oeffentlich verwendet werden
--   website_published = steht auf der Webseite
--
-- Wer eine Fallstudie auf "Oeffentlich verwendbar" setzt, meint damit nicht
-- zwangslaeufig "ab jetzt live". Ein Statuswechsel darf keine Seite ins Netz
-- stellen; das ist eine eigene Entscheidung eines Menschen. Deshalb der zweite
-- Schalter -- und er faellt automatisch zurueck, sobald der Status PUBLISHABLE
-- verlaesst, damit ein Widerruf die Seite auch wirklich raeumt.

alter table public.sale_case_studies
  add column if not exists website_published boolean not null default false,
  add column if not exists website_published_at timestamptz,
  add column if not exists website_published_by uuid references auth.users(id);

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sale_case_studies_website_publishable_check') then
    alter table public.sale_case_studies
      add constraint sale_case_studies_website_publishable_check
      check (not website_published or status = 'PUBLISHABLE');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'sale_case_studies_website_dated_check') then
    alter table public.sale_case_studies
      add constraint sale_case_studies_website_dated_check
      check (not website_published or website_published_at is not null);
  end if;
end $$;

comment on column public.sale_case_studies.website_published is
  'Steht diese Fallstudie auf der oeffentlichen Webseite? Getrennt von status=PUBLISHABLE, weil "darf veroeffentlicht werden" und "ist veroeffentlicht" zwei Entscheidungen sind.';

create index if not exists sale_case_studies_website_published_idx
  on public.sale_case_studies (website_published, release_decided_on desc)
  where website_published;

-- Der Auslöser stempelt die Veroeffentlichung, verlangt dieselbe Berechtigung
-- wie die Freigabeentscheidung und raeumt die Seite bei Statuswechsel.
create or replace function app_private.validate_sale_case_study()
returns trigger
language plpgsql
set search_path to 'app_private', 'public', 'pg_temp'
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

  -- Verlaesst der Status PUBLISHABLE, verschwindet der Eintrag von der Seite.
  -- Ohne diese Zeile bliebe eine zurueckgezogene Fallstudie oeffentlich stehen,
  -- bis jemand daran denkt -- und genau daran denkt niemand.
  if new.status <> 'PUBLISHABLE' then
    new.website_published := false;
  end if;

  if tg_op = 'INSERT' or old.website_published is distinct from new.website_published then
    if new.website_published and not app_private.has_permission('case_study.approve') then
      raise exception 'CASE_STUDY_APPROVE_REQUIRED' using errcode = '42501';
    end if;
    if new.website_published then
      new.website_published_at := coalesce(new.website_published_at, now());
      new.website_published_by := coalesce(new.website_published_by, auth.uid());
    else
      new.website_published_at := null;
      new.website_published_by := null;
    end if;
  end if;

  return new;
end;
$function$;

-- Die oeffentliche Leseschnittstelle.
--
-- Warum SECURITY DEFINER und nicht wie bei den Objekten eine RLS-Regel fuer
-- anon: property_publication_versions ist eine eigens angelegte
-- Veroeffentlichungstabelle, dort ist jede Spalte oeffentlich. sale_case_studies
-- mischt dagegen Oeffentliches mit Internem -- lessons_learned, notes,
-- internal, die Freigabekontakt-Id. Eine Leseregel fuer anon wuerde all das
-- mit oeffnen. Deshalb hier eine Funktion mit ausdruecklicher Spaltenliste:
-- was nicht aufgezaehlt ist, verlaesst die Datenbank nicht.
--
-- Das Zitat wird nur bei schriftlicher Quelle ausgegeben. Eine muendlich
-- gefallene Bemerkung gehoert nicht in Anfuehrungszeichen auf eine Webseite.
create or replace function public.public_case_studies()
returns table (
  referenz text,
  titel text,
  ausgangslage text,
  besonderheiten text,
  zitat text,
  zitat_quelle text,
  zitat_datum date,
  anonymisiert boolean,
  veroeffentlicht_am timestamptz
)
language sql
stable
security definer
set search_path to 'public', 'pg_temp'
as $function$
  select
    cs.case_study_number,
    cs.title,
    nullif(btrim(coalesce(cs.initial_condition, '')), ''),
    nullif(btrim(coalesce(cs.special_aspects, '')), ''),
    case when cs.customer_feedback_source in ('WRITTEN','REVIEW')
         then nullif(btrim(coalesce(cs.customer_feedback, '')), '') end,
    case when cs.customer_feedback_source in ('WRITTEN','REVIEW')
         then cs.customer_feedback_source end,
    case when cs.customer_feedback_source in ('WRITTEN','REVIEW')
         then cs.customer_feedback_on end,
    cs.anonymized,
    cs.website_published_at
  from public.sale_case_studies cs
  where cs.website_published
    and cs.status = 'PUBLISHABLE'
    and cs.archived_at is null
  order by cs.website_published_at desc;
$function$;

revoke all on function public.public_case_studies() from public;
grant execute on function public.public_case_studies() to anon, authenticated;

comment on function public.public_case_studies() is
  'Referenzen fuer die oeffentliche Webseite. Gibt ausschliesslich die aufgezaehlten Spalten freigegebener und veroeffentlichter Fallstudien aus.';

