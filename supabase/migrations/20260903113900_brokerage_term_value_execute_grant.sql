-- Fix zu Thema 1: der Prüf-Trigger der Provisionsvereinbarung läuft mit den Rechten
-- des aufrufenden Benutzers (SECURITY INVOKER). Ohne EXECUTE auf die reine
-- Hilfsfunktion scheitern das Speichern der Käuferseite und die Aktivierung des
-- Auftrags im laufenden Betrieb mit "permission denied for function brokerage_term_value".
-- app_private ist kein exponiertes API-Schema; die Funktion ist immutable und greift
-- auf keine Daten zu.
grant execute on function app_private.brokerage_term_value(text,numeric,numeric) to authenticated;
