# ZeyherMutterOS – Projektstatus

Stand: 29.08.2026

## Aktuelles Ziel
Phase 1 / CRM – erstes nutzbares Multi-User-Grundsystem.

## Erledigt
- separates GitHub-Repository `zeyhermutter/zeyhermutter`
- separates Supabase-STAGING in Frankfurt
- Cloudflare-STAGING über `zeyhermutter.playsony.workers.dev`
- SeasonCrew-Isolation
- React Router + Cloudflare Worker Grundsystem
- Supabase Rollen/Permissions
- RLS-Sicherheitsbasis
- append-only Audit-History
- Activity-History
- Kommentare/Mentions/Notifications Basismodell
- CRM-Datenmodell für Kontakte, Organisationen, Beziehungen und Aufgaben
- feldgenaue Audit-Trigger
- Optimistic-Concurrency-Versionierung
- serverseitige `updated_by`-Pflege
- erster Auth-Benutzer aktiviert
- Rolle `managing_director` zugewiesen
- RLS unter echtem `authenticated`-Benutzerkontext erfolgreich geprüft
- Login/Logout mit SSR-Cookies und `getClaims()`
- `/crm` geschützt
- Browser-Smoke-Test Login erfolgreich
- erster realer STAGING-Kontakt erfolgreich angelegt
- Kontaktanlage und Stammdatenbearbeitung
- Kontakt-History aus append-only AuditLog
- Optimistic-Locking-Konflikterkennung
- Kontaktrollen-Datenmodell und UI-Arbeitsbereich
- Personenbeziehungen mit eingehender/ausgehender Darstellung
- Rollen- und Beziehungsänderungen werden dem Kontakt-Audit zugeordnet
- kontaktbezogene Aufgaben/Wiedervorlagen
- Task-Audit und Optimistic Locking beim Abschließen
- CRM-Dashboard mit Arbeitsbereich/Stammdaten-Navigation
- Organisationen-Verzeichnis und Neuanlage
- Organisationsdetail mit History und Optimistic Locking
- DB-Smoke-Test Kontakte: Create → Audit → Update → Version 2 → veralteter Updateversuch blockiert
- DB-Smoke-Test Rollen/Beziehungen/Aufgaben unter echter Geschäftsführer-RLS erfolgreich
- Audit-Smoke-Test: Kontakt- und Task-Ereignisse erfolgreich erzeugt
- Smoke-Test-Daten vollständig zurückgerollt
- alle ausgeführten Supabase-Migrationen im Repository gespiegelt

## Security
- RLS aktiv auf allen fachlichen Tabellen
- Permission-Prüfung serverseitig/PostgreSQL
- `service_role` wird nicht im Frontend verwendet
- Auth-Responses werden mit `Cache-Control: private, no-store` behandelt
- Supabase Security Advisor meldet aktuell nur `Leaked Password Protection Disabled`
- diese Funktion wird vor Production erneut bewertet/aktiviert, wenn der verwendete Supabase-Tarif sie unterstützt
- MFA bleibt Production-Hardening-Pflicht

## Aktueller Stand im CRM
- Login funktioniert im Browser
- Kontakte können real in STAGING angelegt werden
- CRM-Inkrement 1 ist technisch und im Browser bestätigt
- CRM-Inkrement 2 ist serverseitig/RLS-seitig getestet und im Repository implementiert
- Cloudflare baut neue `main`-Commits automatisch; der neueste UI-Stand muss nach Abschluss des laufenden Builds im Browser sichtbar sein

## Als Nächstes automatisch
1. Kontakt ↔ Organisation Zuordnung im Kontakt-Arbeitsbereich ergänzen
2. Aufgabenverwaltung um Zuständigkeit, Beschreibung und Statuswechsel erweitern
3. globale CRM-Suche implementieren
4. Duplikatprüfung Name + Anschrift ergänzen
5. Archivieren/Wiederherstellen in der UI
6. Modul 01 Abschlussprüfung gegen Definition of Done

## Production
Nicht angelegt / nicht verändert. Production bleibt bis zur ausdrücklichen Freigabe gesperrt.
