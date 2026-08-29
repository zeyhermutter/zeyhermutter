# ZeyherMutterOS – Definition of Done

Ein Feature oder Modul gilt nur als fertig, wenn die für das Risiko relevanten Punkte erfüllt sind.

## Fachlich
- Akzeptanzkriterien erfüllt.
- Statusübergänge und Validierungen sind definiert.
- Fehler- und Sonderfälle sind berücksichtigt.

## Daten
- Datenmodell und Migration sind nachvollziehbar.
- Keine unnötigen redundanten Datenbestände.
- Archivierung/Löschung ist fachlich definiert.
- Geldwerte verwenden geeignete Decimal-Typen.

## Security
- Authentifizierung und serverseitige Autorisierung berücksichtigt.
- RLS vorhanden und getestet, wenn Daten über Supabase exponiert werden.
- Fail-closed bei unklarer Berechtigung.
- Keine Secrets im Repository oder Client-Bundle.

## Nachvollziehbarkeit
- created_at/created_by und updated_at/updated_by, sofern relevant.
- Kritische Änderungen im AuditLog.
- Fachliche Vorgänge in Activity, wenn relevant.
- Änderungshistorie darf nicht still überschrieben werden.

## Multi-User
- Optimistic Concurrency bei relevanten veränderlichen Datensätzen.
- Kein blindes Last-Write-Wins bei kritischen Daten.
- Zuständigkeit/Benutzerbezug nachvollziehbar.

## UI
- Desktop nutzbar.
- Tablet/Smartphone für operative Kernfunktionen nutzbar.
- Lade-, Leer-, Fehler- und Berechtigungszustände vorhanden.

## Qualität
- Relevante Tests risikobasiert erfolgreich.
- Keine bekannten kritischen Fehler.
- Security Advisor nach DDL-Änderungen geprüft.
- Migrationen reproduzierbar im Repository dokumentiert.

## Betrieb
- STAGING erfolgreich.
- Production bleibt ohne ausdrückliche Freigabe unverändert.
- Änderungen an Infrastruktur und Architektur sind dokumentiert.
