-- Geldwaesche-Aufgabe (19.10.2026): faellig um 09:00 Uhr (Berlin) am
-- uebernaechsten Tag statt zur Uhrzeit des naechtlichen Laufs -- wie die
-- uebrigen Aufgaben der Automatik.
do $patch$
declare
  alt text := pg_get_functiondef('app_private.automatik_gwg_identifizierung()'::regprocedure);
  vorher text := 'now() + interval ''2 days''';
  nachher text := '(((now() at time zone ''Europe/Berlin'')::date + 2) + time ''09:00'') at time zone ''Europe/Berlin''';
begin
  if position(nachher in alt) > 0 then
    return;
  end if;
  if (length(alt) - length(replace(alt, vorher, ''))) / length(vorher) <> 1 then
    raise exception 'automatik_gwg_identifizierung: Stelle nicht genau einmal gefunden';
  end if;
  execute replace(alt, vorher, nachher);
end
$patch$;
