-- Taegliche Automatik, Nachtrag (P2-4, 19.10.2026).
--
-- Der erste Lauf auf BETA brach in der Regel "Passende Suchprofile" mit
-- SEARCH_PROFILE_READ_REQUIRED ab: das Matching prueft das Leserecht des
-- angemeldeten Benutzers, und im Zeitplan ist niemand angemeldet. Jetzt
-- rechnet die Regel je Objekt mit der Kennung des Empfaengers (des
-- Verantwortlichen). Wer Suchprofile nicht lesen darf, bekommt keinen Hinweis;
-- der Anlass gilt dann als erledigt und loest nicht taeglich neu aus.

create or replace function app_private.automatik_passende_suchprofile()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  r record;
  n integer := 0;
  neu uuid;
  passend integer;
  vorher text := current_setting('request.jwt.claims', true);
begin
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
    passend := null;
    perform set_config('request.jwt.claims', json_build_object('sub', r.verantwortlich, 'role', 'authenticated')::text, true);
    begin
      select count(*) into passend from public.match_search_profiles_for_property(r.id, 500) m where m.score >= 50;
    exception when others then
      passend := null;
    end;
    perform set_config('request.jwt.claims', coalesce(vorher, ''), true);
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
  return n;
end;
$$;

revoke all on function app_private.automatik_passende_suchprofile() from public, anon, authenticated;

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

  -- 7. Passende Suchprofile bei Vermarktung oder neuem Preis (eigene Funktion,
  --    rechnet mit den Rechten des Empfaengers)
  if 'PASSENDE_SUCHPROFILE' = any(aktiv) then
    begin
      ergebnis := ergebnis || jsonb_build_object('PASSENDE_SUCHPROFILE', app_private.automatik_passende_suchprofile());
    exception when others then
      fehler := fehler || jsonb_build_object('regel', 'PASSENDE_SUCHPROFILE', 'fehler', sqlerrm);
    end;
  end if;

  update public.automation_runs set finished_at = now(), result = ergebnis, errors = fehler where id = lauf;
  return jsonb_build_object('lauf', lauf, 'ergebnis', ergebnis, 'fehler', fehler);
end;
$$;