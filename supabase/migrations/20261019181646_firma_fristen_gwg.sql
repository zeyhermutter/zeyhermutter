-- Firma, Fristen, Geldwaesche-Erinnerung (19.10.2026). Freigabe Sebastian:
-- Pakete "Firmenstammdaten", "GwG-Aufgabe automatisch", "Fristen &
-- Aufbewahrung" (nach seinem Unternehmens-Dokument). Nur BETA.
--
-- Das CRM bewertet keine Rechts- oder Steuerfragen. Es haelt Angaben fest,
-- die das Buero selbst eintraegt, und erinnert -- es entscheidet nichts und
-- verschickt nichts.
--
-- 1. company_profile: die Firmenangaben an einer Stelle (genau eine Zeile).
--    Gebraucht fuer Exposé-Fusszeile und den E-Mail-Platzhalter
--    {{firma_pflichtangaben}}. Lesen alle Angemeldeten, aendern nur mit
--    settings.manage.
-- 2. company_deadlines: wiederkehrende Fristen des Unternehmens. Die Regel
--    FIRMEN_FRISTEN der taeglichen Automatik legt vor jeder Faelligkeit eine
--    Aufgabe an. Vorbelegt sind -- ausgeschaltet -- die Termine aus Sebastians
--    Dokument; sie gelten erst, wenn jemand sie bestaetigt und einschaltet.
-- 3. Regel GWG_IDENTIFIZIERUNG: Liegt zu einem Objekt ein Kaufangebot oder
--    eine aktive Reservierung vor und ist fuer Kaufinteressent oder
--    Eigentuemer in der Geldwaesche-Akte des Objekts keine Identifizierung
--    erfasst, bekommt der Verantwortliche einmal je Objekt und Interessent
--    eine Aufgabe. Ob und wann identifiziert werden muss, entscheidet das Buero.

create table if not exists public.company_profile (
  id uuid primary key default gen_random_uuid(),
  singleton boolean not null default true unique check (singleton),
  legal_name text,
  brand_name text,
  street text,
  postal_code text,
  city text,
  registered_seat text,
  register_court text,
  register_number text,
  managing_directors text,
  tax_number text,
  vat_id text,
  phone text,
  email text,
  website text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  version bigint not null default 1 check (version > 0),
  constraint company_profile_laengen check (
    coalesce(char_length(legal_name), 0) <= 200 and coalesce(char_length(brand_name), 0) <= 200
    and coalesce(char_length(street), 0) <= 200 and coalesce(char_length(postal_code), 0) <= 20
    and coalesce(char_length(city), 0) <= 120 and coalesce(char_length(registered_seat), 0) <= 120
    and coalesce(char_length(register_court), 0) <= 160 and coalesce(char_length(register_number), 0) <= 60
    and coalesce(char_length(managing_directors), 0) <= 300 and coalesce(char_length(tax_number), 0) <= 60
    and coalesce(char_length(vat_id), 0) <= 40 and coalesce(char_length(phone), 0) <= 60
    and coalesce(char_length(email), 0) <= 254 and coalesce(char_length(website), 0) <= 200)
);

comment on table public.company_profile is
  'Firmenangaben an einer Stelle (genau eine Zeile). Vom Buero gepflegt; das CRM prueft die Angaben nicht rechtlich.';

insert into public.company_profile (singleton, legal_name)
values (true, 'Zeyher & Mutter Immobilien UG (haftungsbeschränkt)')
on conflict (singleton) do nothing;

alter table public.company_profile enable row level security;
create policy company_profile_select on public.company_profile for select to authenticated using (true);
create policy company_profile_update on public.company_profile for update to authenticated
  using ((select app_private.has_permission('settings.manage')))
  with check ((select app_private.has_permission('settings.manage')));
grant select, update on public.company_profile to authenticated;

create trigger company_profile_set_metadata
  before update on public.company_profile
  for each row execute function app_private.set_standard_update_metadata();
create trigger company_profile_audit
  after insert or update on public.company_profile
  for each row execute function app_private.audit_row_change('COMPANY_PROFILE', 'legal_name');

create table if not exists public.company_deadlines (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  note text,
  first_due_on date not null,
  repeat text not null default 'YEARLY',
  lead_days integer not null default 7,
  responsible_user uuid,
  active boolean not null default false,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  version bigint not null default 1 check (version > 0),
  constraint company_deadlines_title_check check (btrim(title) <> '' and char_length(title) <= 160),
  constraint company_deadlines_note_check check (note is null or char_length(note) <= 2000),
  constraint company_deadlines_repeat_check check (repeat in ('ONCE', 'MONTHLY', 'QUARTERLY', 'YEARLY')),
  constraint company_deadlines_lead_check check (lead_days between 0 and 90),
  constraint company_deadlines_active_responsible check (not active or responsible_user is not null)
);

comment on table public.company_deadlines is
  'Wiederkehrende Fristen des Unternehmens (Verwaltung > Firma & Fristen). Die Automatik legt vor jeder Faelligkeit eine Aufgabe an; Termine traegt das Buero ein.';

alter table public.company_deadlines enable row level security;
create policy company_deadlines_select on public.company_deadlines for select to authenticated using (true);
create policy company_deadlines_insert on public.company_deadlines for insert to authenticated
  with check ((select app_private.has_permission('settings.manage')));
create policy company_deadlines_update on public.company_deadlines for update to authenticated
  using ((select app_private.has_permission('settings.manage')))
  with check ((select app_private.has_permission('settings.manage')));
grant select, insert, update on public.company_deadlines to authenticated;

create trigger company_deadlines_set_metadata
  before update on public.company_deadlines
  for each row execute function app_private.set_standard_update_metadata();
create trigger company_deadlines_audit
  after insert or update on public.company_deadlines
  for each row execute function app_private.audit_row_change('COMPANY_DEADLINE', 'title');

-- Vorschlaege aus Sebastians Dokument vom 19.10.2026 -- ausgeschaltet, ohne
-- Verantwortlichen. Erst nach Bestaetigung (Steuerberater) einschalten.
insert into public.company_deadlines (title, note, first_due_on, repeat, lead_days, active)
select v.title, v.note, v.first_due_on, v.repeat, v.lead_days, false
  from (values
    ('Körperschaftsteuer-Vorauszahlung',
     'Vorschlag aus eurem Unternehmens-Dokument (19.10.2026): grundsätzlich 10.03., 10.06., 10.09. und 10.12. Mit dem Steuerberater bestätigen, Verantwortlichen eintragen, dann einschalten.',
     date '2026-12-10', 'QUARTERLY', 7),
    ('Gewerbesteuer-Vorauszahlung',
     'Vorschlag aus eurem Unternehmens-Dokument (19.10.2026): grundsätzlich 15.02., 15.05., 15.08. und 15.11. Mit dem Steuerberater bestätigen, Verantwortlichen eintragen, dann einschalten.',
     date '2026-11-15', 'QUARTERLY', 7),
    ('Jahresabschluss aufstellen',
     'Vorschlag aus eurem Unternehmens-Dokument (19.10.2026): bei kleinen Kapitalgesellschaften grundsätzlich in den ersten sechs Monaten des Folgejahres. Mit dem Steuerberater bestätigen, dann einschalten.',
     date '2027-06-30', 'YEARLY', 30),
    ('Jahresabschluss offenlegen oder hinterlegen',
     'Vorschlag aus eurem Unternehmens-Dokument (19.10.2026): spätestens ein Jahr nach dem Abschlussstichtag. Mit dem Steuerberater bestätigen, dann einschalten.',
     date '2027-12-31', 'YEARLY', 30)
  ) as v(title, note, first_due_on, repeat, lead_days)
 where not exists (select 1 from public.company_deadlines d where d.title = v.title);

insert into public.automation_rules (key, title, description, sort_order) values
  ('GWG_IDENTIFIZIERUNG', 'Geldwäsche: Identifizierung prüfen',
   'Liegt zu einem Objekt ein Kaufangebot oder eine aktive Reservierung vor und ist für Kaufinteressent oder Eigentümer in der Geldwäsche-Akte des Objekts keine Identifizierung erfasst, bekommt der Verantwortliche einmalig eine Aufgabe. Ob und wann identifiziert werden muss, entscheiden Sie.', 55),
  ('FIRMEN_FRISTEN', 'Fristen des Unternehmens',
   'Für jede eingeschaltete Frist unter Verwaltung › Firma & Fristen bekommt der Verantwortliche vor der Fälligkeit (Vorlauf je Frist) einmalig eine Aufgabe.', 80)
on conflict (key) do update set title = excluded.title, description = excluded.description, sort_order = excluded.sort_order;

create or replace function app_private.automatik_gwg_identifizierung()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  n integer := 0;
  neu uuid;
  aufgabe uuid;
  offen text[];
begin
  for r in
    select distinct on (i.property_id, i.contact_id) i.property_id, i.contact_id, i.anlass, i.verantwortlich, p.property_number
      from (
        select o.property_id, o.contact_id, 'Kaufangebot ' || o.offer_number as anlass,
               coalesce(o.primary_responsible_user, pp.primary_responsible_user) as verantwortlich
          from public.purchase_offers o
          join public.properties pp on pp.id = o.property_id
         where o.archived_at is null and o.status in ('SUBMITTED', 'COUNTERED', 'ACCEPTED')
        union all
        select rv.property_id, rv.contact_id, 'Reservierung ' || rv.reservation_number,
               coalesce(rv.primary_responsible_user, pp.primary_responsible_user)
          from public.property_reservations rv
          join public.properties pp on pp.id = rv.property_id
         where rv.archived_at is null and rv.status = 'ACTIVE'
      ) i
      join public.properties p on p.id = i.property_id
     order by i.property_id, i.contact_id, i.anlass
  loop
    continue when r.contact_id is null or not app_private.ist_aktiv(r.verantwortlich);
    select array_agg(x.name order by x.name) into offen
      from (
        select concat_ws(' ', c.first_name, c.last_name) || ' (' || t.rolle || ')' as name
          from (
            select r.contact_id as kontakt, 'Kaufinteressent' as rolle
            union
            select o.contact_id, 'Eigentümer'
              from public.property_owners o
             where o.property_id = r.property_id and (o.valid_until is null or o.valid_until >= current_date)
          ) t
          join public.contacts c on c.id = t.kontakt
         where not exists (
           select 1 from public.gwg_identifications gi
             join public.gwg_cases gc on gc.id = gi.gwg_case_id
            where gc.property_id = r.property_id and gi.contact_id = t.kontakt and gi.identified_on is not null)
      ) x;
    continue when offen is null;
    insert into public.automation_hits (rule_key, entity_type, entity_id, occurrence_key)
    values ('GWG_IDENTIFIZIERUNG', 'PROPERTY', r.property_id, r.contact_id::text)
    on conflict do nothing returning id into neu;
    continue when neu is null;
    insert into public.tasks (title, description, due_at, responsible_user, property_id, contact_id, priority)
    values ('Geldwäsche: Identifizierung prüfen – ' || r.property_number,
            r.anlass || ' liegt vor. In der Geldwäsche-Akte dieses Objekts ist noch keine Identifizierung erfasst für: '
              || array_to_string(offen, ', ')
              || '. Ob und wann eine Identifizierung nötig ist, entscheiden Sie – das CRM bewertet das nicht.',
            now() + interval '2 days', r.verantwortlich, r.property_id, r.contact_id, 'HIGH')
    returning id into aufgabe;
    update public.automation_hits set task_id = aufgabe, notified_users = 1 where id = neu;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function app_private.automatik_gwg_identifizierung() from public, anon, authenticated;

create or replace function app_private.automatik_firmen_fristen()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  heute date := (now() at time zone 'Europe/Berlin')::date;
  r record;
  n integer := 0;
  monate integer;
  naechste date;
  neu uuid;
  aufgabe uuid;
begin
  for r in
    select d.* from public.company_deadlines d
     where d.active and d.responsible_user is not null
  loop
    continue when not app_private.ist_aktiv(r.responsible_user);
    monate := case r.repeat when 'MONTHLY' then 1 when 'QUARTERLY' then 3 when 'YEARLY' then 12 else null end;
    if monate is null then
      naechste := case when r.first_due_on >= heute then r.first_due_on else null end;
    else
      -- vom ersten Termin aus gezaehlt, damit der 31. nicht zum 28. wandert
      select min((r.first_due_on + make_interval(months => k * monate))::date) into naechste
        from generate_series(0, 1200) k
       where (r.first_due_on + make_interval(months => k * monate))::date >= heute;
    end if;
    continue when naechste is null or naechste - r.lead_days > heute;
    insert into public.automation_hits (rule_key, entity_type, entity_id, occurrence_key)
    values ('FIRMEN_FRISTEN', 'COMPANY_DEADLINE', r.id, naechste::text)
    on conflict do nothing returning id into neu;
    continue when neu is null;
    insert into public.tasks (title, description, due_at, responsible_user, priority)
    values (r.title || ' – fällig ' || to_char(naechste, 'DD.MM.YYYY'),
            coalesce(nullif(btrim(r.note), '') || ' ', '') || '(Frist aus Verwaltung › Firma & Fristen.)',
            (naechste + time '09:00') at time zone 'Europe/Berlin', r.responsible_user, 'NORMAL')
    returning id into aufgabe;
    update public.automation_hits set task_id = aufgabe, notified_users = 1 where id = neu;
    n := n + 1;
  end loop;
  return n;
end;
$$;

revoke all on function app_private.automatik_firmen_fristen() from public, anon, authenticated;

-- Der Lauf bekommt die Regeln 8 und 9 am Ende. Statt die ganze Funktion
-- (Stand 20261019064739) hier zu wiederholen, wird ihre gespeicherte
-- Fassung an genau einer Stelle ergaenzt; passt die Stelle nicht genau
-- einmal, bricht die Migration ab.
do $patch$
declare
  alt text := pg_get_functiondef('app_private.automatik_lauf(text, uuid)'::regprocedure);
  marke text := '  update public.automation_runs set finished_at = now(), result = ergebnis, errors = fehler where id = lauf;';
  neu text := '  -- 8. Geldwaesche: Identifizierung pruefen (19.10.2026)
  if ''GWG_IDENTIFIZIERUNG'' = any(aktiv) then
    begin
      ergebnis := ergebnis || jsonb_build_object(''GWG_IDENTIFIZIERUNG'', app_private.automatik_gwg_identifizierung());
    exception when others then
      fehler := fehler || jsonb_build_object(''regel'', ''GWG_IDENTIFIZIERUNG'', ''fehler'', sqlerrm);
    end;
  end if;

  -- 9. Fristen des Unternehmens (19.10.2026)
  if ''FIRMEN_FRISTEN'' = any(aktiv) then
    begin
      ergebnis := ergebnis || jsonb_build_object(''FIRMEN_FRISTEN'', app_private.automatik_firmen_fristen());
    exception when others then
      fehler := fehler || jsonb_build_object(''regel'', ''FIRMEN_FRISTEN'', ''fehler'', sqlerrm);
    end;
  end if;

';
begin
  if position('GWG_IDENTIFIZIERUNG' in alt) > 0 then
    return; -- schon ergaenzt
  end if;
  if (length(alt) - length(replace(alt, marke, ''))) / length(marke) <> 1 then
    raise exception 'automatik_lauf: Einfuegestelle nicht genau einmal gefunden';
  end if;
  execute replace(alt, marke, neu || marke);
end
$patch$;
