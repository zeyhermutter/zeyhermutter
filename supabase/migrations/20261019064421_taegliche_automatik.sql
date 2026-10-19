-- Taegliche Automatik (P2-4, 19.10.2026). Freigabe Sebastian: "P24 ---> JA".
--
-- Ein Lauf am fruehen Morgen legt Aufgaben und Benachrichtigungen an -- nichts
-- sonst. Er verschickt nichts, aendert keinen Status und entfernt nichts.
-- Jede Regel ist dublettensicher: Was einmal ausgeloest hat, steht in
-- automation_hits (Regel + Datensatz + Anlass, eindeutig) und loest fuer
-- denselben Anlass nie wieder aus. Aendert sich der Anlass (neues Datum, neuer
-- Preis), gibt es einen neuen Hinweis.
--
-- Zeitplan ueber Supabase Cron (pg_cron) in der Datenbank selbst: kein
-- Geheimnis im Worker, keine Rechenzeit-Grenze des Workers, keine Kosten.
-- Jede Regel ist einzeln abschaltbar (Verwaltung > Automatik).

create extension if not exists pg_cron with schema pg_catalog;

create table if not exists public.automation_rules (
  key text primary key,
  title text not null,
  description text not null,
  active boolean not null default true,
  sort_order integer not null default 100,
  updated_at timestamptz not null default now(),
  updated_by uuid
);

create table if not exists public.automation_hits (
  id uuid primary key default gen_random_uuid(),
  rule_key text not null references public.automation_rules(key),
  entity_type text not null,
  entity_id uuid not null,
  occurrence_key text not null,
  task_id uuid,
  notified_users integer not null default 0,
  created_at timestamptz not null default now(),
  constraint automation_hits_once unique (rule_key, entity_id, occurrence_key)
);

create table if not exists public.automation_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  trigger text not null check (trigger in ('ZEITPLAN', 'HAND')),
  triggered_by uuid,
  result jsonb not null default '{}'::jsonb,
  errors jsonb not null default '[]'::jsonb
);

create index if not exists automation_runs_started_idx on public.automation_runs (started_at desc);
create index if not exists automation_hits_created_idx on public.automation_hits (created_at desc);

alter table public.automation_rules enable row level security;
alter table public.automation_hits enable row level security;
alter table public.automation_runs enable row level security;

create policy automation_rules_read on public.automation_rules for select to authenticated using (true);
create policy automation_rules_switch on public.automation_rules for update to authenticated
  using (app_private.has_permission('settings.manage')) with check (app_private.has_permission('settings.manage'));
create policy automation_hits_read on public.automation_hits for select to authenticated using (app_private.has_permission('settings.manage'));
create policy automation_runs_read on public.automation_runs for select to authenticated using (app_private.has_permission('settings.manage'));

-- Schreiben nur ueber die Funktionen: RLS ohne Insert-Policy sperrt alles andere.
revoke update on public.automation_rules from anon, authenticated;
grant update (active, updated_at, updated_by) on public.automation_rules to authenticated;

insert into public.automation_rules (key, title, description, sort_order) values
  ('ANFRAGE_ESKALATION', 'Unbeantwortete Anfragen eskalieren',
   'Ist bei einer offenen Anfrage die Eskalationszeit ihres Kanals überschritten, bekommt der Verantwortliche einmalig die Aufgabe „Anfrage … ist unbeantwortet“ – dieselbe Regel wie der Knopf „Überfällige eskalieren“.', 10),
  ('RESERVIERUNG_ENDET', 'Reservierung endet bald',
   'Endet eine aktive Reservierung in den nächsten 7 Tagen, bekommt der Verantwortliche einmalig eine Aufgabe, fällig am letzten Tag. Die Reservierung selbst bleibt unverändert.', 20),
  ('AUFTRAG_ENDET', 'Maklerauftrag endet bald',
   'Endet die Laufzeit eines aktiven Maklerauftrags in den nächsten 7 Tagen, bekommt der Verantwortliche einmalig eine Aufgabe, fällig am letzten Tag. Der Auftrag ändert seinen Status nicht.', 30),
  ('LEAD_WIEDERVORLAGE', 'Lead-Wiedervorlage fällig',
   'Ist die Wiedervorlage eines offenen Leads heute oder früher, bekommt der Verantwortliche eine Benachrichtigung – einmal je Wiedervorlagedatum.', 40),
  ('GWG_WIEDERVORLAGE', 'Geldwäsche: nächste Risikoprüfung',
   'Steht die nächste Risikoprüfung einer Geldwäsche-Akte in den nächsten 7 Tagen an oder ist sie überschritten, bekommt der Verantwortliche eine Benachrichtigung – einmal je Datum. Das CRM bewertet nichts.', 50),
  ('AUFBEWAHRUNG_ENDET', 'Aufbewahrung läuft ab',
   'Läuft die Aufbewahrungsfrist von Dokumenten ohne Sperrvermerk in den nächsten 30 Tagen ab, bekommt die Geschäftsführung eine zusammenfassende Benachrichtigung – einmal je Dokument und Frist. Gelöscht wird nichts.', 60),
  ('PASSENDE_SUCHPROFILE', 'Passende Suchprofile bei Vermarktung oder neuem Preis',
   'Geht ein Objekt in die Vermarktung oder ändert sich sein Preis, bekommt der Verantwortliche eine Benachrichtigung mit der Zahl passender aktiver Suchprofile (ab „teilweise passend“). Niemand wird angeschrieben.', 70)
on conflict (key) do update set title = excluded.title, description = excluded.description, sort_order = excluded.sort_order;

-- Anfragen eskalieren ohne Rechtepruefung (fuer den Lauf). Der Knopf ruft
-- weiter public.escalate_overdue_inquiries auf, die das Recht prueft.
create or replace function app_private.eskaliere_anfragen()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_row record;
  v_count integer := 0;
  n integer;
begin
  for v_row in
    select o.inquiry_id, o.inquiry_number, o.responsible_user, o.elapsed_hours, o.target_hours,
           i.contact_id, i.property_id
      from public.inquiry_response_overview(true) o
      join public.inquiries i on i.id = o.inquiry_id
     where o.state = 'ESCALATION_DUE' and not o.escalated
  loop
    -- Ohne Verantwortlichen gaebe es niemanden, dem die Wiedervorlage gehoert.
    if v_row.responsible_user is not null then
      insert into public.tasks(title, description, due_at, responsible_user, contact_id,
                               property_id, inquiry_id, response_escalation, priority)
      values ('Anfrage ' || v_row.inquiry_number || ' ist unbeantwortet',
              'Die Zielzeit von ' || v_row.target_hours
                || case when v_row.target_hours = 1 then ' Stunde' else ' Stunden' end
                || ' ist überschritten. Erfasst wurde die Anfrage vor rund '
                || round(v_row.elapsed_hours)
                || case when round(v_row.elapsed_hours) = 1 then ' Stunde.' else ' Stunden.' end,
              now(), v_row.responsible_user, v_row.contact_id, v_row.property_id,
              v_row.inquiry_id, true, 'HIGH')
      on conflict do nothing;
      get diagnostics n = row_count;
      v_count := v_count + n;
    end if;
  end loop;
  return v_count;
end;
$$;

create or replace function public.escalate_overdue_inquiries()
returns integer
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if not app_private.has_permission('inquiry.escalate') then
    raise exception 'INQUIRY_ESCALATE_REQUIRED' using errcode = '42501';
  end if;
  return app_private.eskaliere_anfragen();
end;
$$;

create or replace function app_private.ist_aktiv(p_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select p_user is not null and exists (select 1 from public.profiles p where p.user_id = p_user and p.status = 'ACTIVE');
$$;

-- Der Lauf. Jede Regel in einem eigenen Block: scheitert eine, laufen die
-- anderen weiter, und der Fehler steht im Protokoll des Laufs.
create or replace function app_private.automatik_lauf(p_trigger text default 'ZEITPLAN', p_user uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  heute date := (now() at time zone 'Europe/Berlin')::date;
  lauf uuid;
  ergebnis jsonb := '{}'::jsonb;
  fehler jsonb := '[]'::jsonb;
  aktiv text[] := array(select key from public.automation_rules where active);
  r record;
  n integer;
  neu uuid;
  aufgabe uuid;
  passend integer;
  empfaenger integer;
begin
  insert into public.automation_runs (trigger, triggered_by) values (p_trigger, p_user) returning id into lauf;

  -- 1. Unbeantwortete Anfragen eskalieren
  if 'ANFRAGE_ESKALATION' = any(aktiv) then
    begin
      ergebnis := ergebnis || jsonb_build_object('ANFRAGE_ESKALATION', app_private.eskaliere_anfragen());
    exception when others then
      fehler := fehler || jsonb_build_object('regel', 'ANFRAGE_ESKALATION', 'fehler', sqlerrm);
    end;
  end if;

  -- 2. Reservierung endet in den naechsten 7 Tagen
  if 'RESERVIERUNG_ENDET' = any(aktiv) then
    begin
      n := 0;
      for r in
        select rv.id, rv.reservation_number, rv.reserved_until, rv.property_id, p.property_number,
               coalesce(rv.primary_responsible_user, p.primary_responsible_user) as verantwortlich
          from public.property_reservations rv
          join public.properties p on p.id = rv.property_id
         where rv.status = 'ACTIVE' and rv.archived_at is null
           and rv.reserved_until between heute and heute + 7
      loop
        continue when not app_private.ist_aktiv(r.verantwortlich);
        insert into public.automation_hits (rule_key, entity_type, entity_id, occurrence_key)
        values ('RESERVIERUNG_ENDET', 'RESERVATION', r.id, r.reserved_until::text)
        on conflict do nothing returning id into neu;
        continue when neu is null;
        insert into public.tasks (title, description, due_at, responsible_user, property_id, priority)
        values ('Reservierung ' || r.reservation_number || ' endet am ' || to_char(r.reserved_until, 'DD.MM.YYYY'),
                'Die Reservierung für ' || r.property_number || ' läuft am ' || to_char(r.reserved_until, 'DD.MM.YYYY')
                  || ' ab. Verlängern, umwandeln oder enden lassen – das CRM ändert die Reservierung nicht.',
                (r.reserved_until + time '09:00') at time zone 'Europe/Berlin', r.verantwortlich, r.property_id, 'NORMAL')
        returning id into aufgabe;
        update public.automation_hits set task_id = aufgabe, notified_users = 1 where id = neu;
        n := n + 1;
      end loop;
      ergebnis := ergebnis || jsonb_build_object('RESERVIERUNG_ENDET', n);
    exception when others then
      fehler := fehler || jsonb_build_object('regel', 'RESERVIERUNG_ENDET', 'fehler', sqlerrm);
    end;
  end if;

  -- 3. Maklerauftrag endet in den naechsten 7 Tagen
  if 'AUFTRAG_ENDET' = any(aktiv) then
    begin
      n := 0;
      for r in
        select m.id, m.mandate_number, m.term_end, m.property_id, p.property_number,
               coalesce(m.primary_responsible_user, p.primary_responsible_user) as verantwortlich
          from public.brokerage_mandates m
          join public.properties p on p.id = m.property_id
         where m.status = 'ACTIVE' and m.archived_at is null
           and m.term_end between heute and heute + 7
      loop
        continue when not app_private.ist_aktiv(r.verantwortlich);
        insert into public.automation_hits (rule_key, entity_type, entity_id, occurrence_key)
        values ('AUFTRAG_ENDET', 'MANDATE', r.id, r.term_end::text)
        on conflict do nothing returning id into neu;
        continue when neu is null;
        insert into public.tasks (title, description, due_at, responsible_user, property_id, mandate_id, priority)
        values ('Maklerauftrag ' || r.mandate_number || ' endet am ' || to_char(r.term_end, 'DD.MM.YYYY'),
                'Die Laufzeit des Maklerauftrags für ' || r.property_number || ' endet am ' || to_char(r.term_end, 'DD.MM.YYYY')
                  || '. Verlängern oder auslaufen lassen – das CRM ändert den Auftrag nicht.',
                (r.term_end + time '09:00') at time zone 'Europe/Berlin', r.verantwortlich, r.property_id, r.id, 'NORMAL')
        on conflict do nothing
        returning id into aufgabe;
        update public.automation_hits set task_id = aufgabe, notified_users = case when aufgabe is null then 0 else 1 end where id = neu;
        n := n + case when aufgabe is null then 0 else 1 end;
      end loop;
      ergebnis := ergebnis || jsonb_build_object('AUFTRAG_ENDET', n);
    exception when others then
      fehler := fehler || jsonb_build_object('regel', 'AUFTRAG_ENDET', 'fehler', sqlerrm);
    end;
  end if;

  -- 4. Lead-Wiedervorlage faellig
  if 'LEAD_WIEDERVORLAGE' = any(aktiv) then
    begin
      n := 0;
      for r in
        select l.id, l.lead_number, l.follow_up_at, l.primary_responsible_user as verantwortlich,
               concat_ws(' ', c.first_name, c.last_name) as kontakt
          from public.leads l
          left join public.contacts c on c.id = l.contact_id
         where l.archived_at is null and l.status not in ('WON', 'LOST')
           and l.follow_up_at is not null
           and (l.follow_up_at at time zone 'Europe/Berlin')::date <= heute
      loop
        continue when not app_private.ist_aktiv(r.verantwortlich);
        insert into public.automation_hits (rule_key, entity_type, entity_id, occurrence_key, notified_users)
        values ('LEAD_WIEDERVORLAGE', 'LEAD', r.id, r.follow_up_at::text, 1)
        on conflict do nothing returning id into neu;
        continue when neu is null;
        insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
        values (r.verantwortlich, 'AUTOMATIK', 'Wiedervorlage fällig: ' || r.lead_number,
                coalesce(nullif(r.kontakt, '') || ' · ', '') || 'fällig seit '
                  || to_char(r.follow_up_at at time zone 'Europe/Berlin', 'DD.MM.YYYY HH24:MI'),
                'LEAD', r.id);
        n := n + 1;
      end loop;
      ergebnis := ergebnis || jsonb_build_object('LEAD_WIEDERVORLAGE', n);
    exception when others then
      fehler := fehler || jsonb_build_object('regel', 'LEAD_WIEDERVORLAGE', 'fehler', sqlerrm);
    end;
  end if;

  -- 5. Geldwaesche: naechste Risikopruefung
  if 'GWG_WIEDERVORLAGE' = any(aktiv) then
    begin
      n := 0;
      for r in
        select g.id, g.case_number, g.risk_next_review_on, g.property_id, p.property_number,
               coalesce(g.primary_responsible_user, p.primary_responsible_user) as verantwortlich
          from public.gwg_cases g
          join public.properties p on p.id = g.property_id
         where g.archived_at is null and g.risk_next_review_on is not null
           and g.risk_next_review_on <= heute + 7
      loop
        continue when not app_private.ist_aktiv(r.verantwortlich);
        insert into public.automation_hits (rule_key, entity_type, entity_id, occurrence_key, notified_users)
        values ('GWG_WIEDERVORLAGE', 'GWG_CASE', r.id, r.risk_next_review_on::text, 1)
        on conflict do nothing returning id into neu;
        continue when neu is null;
        insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
        values (r.verantwortlich, 'AUTOMATIK', 'Risikoprüfung ' || r.case_number || ' am ' || to_char(r.risk_next_review_on, 'DD.MM.YYYY'),
                r.property_number || ' · nächste Risikoprüfung laut Akte am ' || to_char(r.risk_next_review_on, 'DD.MM.YYYY'),
                'PROPERTY_COMPLIANCE', r.property_id);
        n := n + 1;
      end loop;
      ergebnis := ergebnis || jsonb_build_object('GWG_WIEDERVORLAGE', n);
    exception when others then
      fehler := fehler || jsonb_build_object('regel', 'GWG_WIEDERVORLAGE', 'fehler', sqlerrm);
    end;
  end if;

  -- 6. Aufbewahrung laeuft ab -- eine Benachrichtigung je Lauf und Person
  if 'AUFBEWAHRUNG_ENDET' = any(aktiv) then
    begin
      n := 0;
      for r in
        select d.id, d.retention_until
          from public.documents d
         where d.archived_at is null and not coalesce(d.legal_hold, false)
           and d.retention_until is not null and d.retention_until <= heute + 30
      loop
        insert into public.automation_hits (rule_key, entity_type, entity_id, occurrence_key)
        values ('AUFBEWAHRUNG_ENDET', 'DOCUMENT', r.id, r.retention_until::text)
        on conflict do nothing returning id into neu;
        continue when neu is null;
        n := n + 1;
      end loop;
      empfaenger := 0;
      if n > 0 then
        insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
        select distinct ur.user_id, 'AUTOMATIK', 'Aufbewahrung läuft ab',
               n || case when n = 1 then ' Dokument' else ' Dokumente' end
                 || ': Die Aufbewahrungsfrist endet in den nächsten 30 Tagen oder ist abgelaufen. Gelöscht wird nichts.',
               'AUFBEWAHRUNG', null::uuid
          from public.user_roles ur
          join public.roles ro on ro.id = ur.role_id and ro.key = 'managing_director'
         where ur.revoked_at is null and app_private.ist_aktiv(ur.user_id);
        get diagnostics empfaenger = row_count;
        update public.automation_hits set notified_users = empfaenger
         where rule_key = 'AUFBEWAHRUNG_ENDET' and created_at >= (select started_at from public.automation_runs where id = lauf);
      end if;
      ergebnis := ergebnis || jsonb_build_object('AUFBEWAHRUNG_ENDET', n);
    exception when others then
      fehler := fehler || jsonb_build_object('regel', 'AUFBEWAHRUNG_ENDET', 'fehler', sqlerrm);
    end;
  end if;

  -- 7. Passende Suchprofile bei Vermarktung oder neuem Preis
  if 'PASSENDE_SUCHPROFILE' = any(aktiv) then
    begin
      n := 0;
      for r in
        select p.id, p.property_number, p.internal_title, p.primary_responsible_user as verantwortlich,
               coalesce(p.purchase_price, p.rent_cold) as preis
          from public.properties p
         where p.status = 'MARKETING'
      loop
        continue when not app_private.ist_aktiv(r.verantwortlich);
        insert into public.automation_hits (rule_key, entity_type, entity_id, occurrence_key)
        values ('PASSENDE_SUCHPROFILE', 'PROPERTY', r.id, 'MARKETING:' || coalesce(r.preis::text, '-'))
        on conflict do nothing returning id into neu;
        continue when neu is null;
        select count(*) into passend from public.match_search_profiles_for_property(r.id, 500) m where m.score >= 50;
        if passend > 0 then
          insert into public.notifications (user_id, type, title, message, entity_type, entity_id)
          values (r.verantwortlich, 'AUTOMATIK',
                  r.property_number || ': ' || passend || case when passend = 1 then ' passendes Suchprofil' else ' passende Suchprofile' end,
                  coalesce(r.internal_title || ' · ', '') || 'in Vermarktung'
                    || case when r.preis is not null then ' zu ' || replace(to_char(r.preis, 'FM999,999,999,990'), ',', '.') || ' €' else '' end
                    || '. Niemand wurde angeschrieben.',
                  'PROPERTY_INTERESTS', r.id);
          update public.automation_hits set notified_users = 1 where id = neu;
          n := n + 1;
        end if;
      end loop;
      ergebnis := ergebnis || jsonb_build_object('PASSENDE_SUCHPROFILE', n);
    exception when others then
      fehler := fehler || jsonb_build_object('regel', 'PASSENDE_SUCHPROFILE', 'fehler', sqlerrm);
    end;
  end if;

  update public.automation_runs set finished_at = now(), result = ergebnis, errors = fehler where id = lauf;
  return jsonb_build_object('lauf', lauf, 'ergebnis', ergebnis, 'fehler', fehler);
end;
$$;

-- "Jetzt ausfuehren" in Verwaltung > Automatik: nur mit settings.manage.
create or replace function public.run_automation_now()
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if not app_private.has_permission('settings.manage') then
    raise exception 'AUTOMATION_PERMISSION_MISSING' using errcode = '42501';
  end if;
  return app_private.automatik_lauf('HAND', auth.uid());
end;
$$;

revoke all on function public.run_automation_now() from public, anon;
grant execute on function public.run_automation_now() to authenticated;
revoke all on function app_private.automatik_lauf(text, uuid) from public, anon, authenticated;
revoke all on function app_private.eskaliere_anfragen() from public, anon, authenticated;

-- Taeglich 04:30 UTC = 06:30 Uhr Sommerzeit / 05:30 Uhr Winterzeit.
select cron.schedule('zeyhermutter-automatik', '30 4 * * *', $cron$select app_private.automatik_lauf('ZEITPLAN')$cron$);
