-- Frist "Weiterbildung" als Vorschlag (19.10.2026).
-- Freigabe Sebastian ("Ja bitte"): Weiterbildungspflicht als Frist statt
-- eigener Seite; die Seite Weiterbildung bleibt ausgeblendet. Wie die
-- anderen Vorschlaege zunaechst ausgeschaltet.
insert into public.company_deadlines (title, note, first_due_on, repeat, lead_days, active)
select 'Weiterbildung: Stand und Nachweise prüfen',
       'Vorschlag aus eurem Unternehmens-Dokument (19.10.2026): 20 Stunden Weiterbildung innerhalb von drei Kalenderjahren für Makler und mitwirkende Beschäftigte. Einmal im Jahr die Stunden prüfen und die Nachweise als Dokument (Weiterbildungsnachweis) ablegen. Beginn des Zeitraums klären, Verantwortlichen eintragen, dann einschalten.',
       date '2027-12-15', 'YEARLY', 30, false
 where not exists (select 1 from public.company_deadlines where title = 'Weiterbildung: Stand und Nachweise prüfen');
