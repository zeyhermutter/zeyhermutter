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
- Security-Härtung der privaten Permission-Helper
- Login/Logout-Routen mit SSR-Cookies und `getClaims()`
- geschützte `/crm`-Route
- responsive CRM-Dashboard-Shell
- Kontaktanlage implementiert
- Kontaktdetail mit Bearbeitung implementiert
- Kontakt-History aus append-only AuditLog implementiert
- Optimistic-Locking-Konflikterkennung in der Kontaktbearbeitung implementiert
- DB-Smoke-Test erfolgreich: Create → Audit → Update → Version 2 → veralteter Updateversuch blockiert
- Smoke-Test vollständig zurückgerollt, keine Testkontakte verblieben
- alle ausgeführten Supabase-Migrationen im Repository gespiegelt

## Security
- RLS aktiv auf allen fachlichen Tabellen
- Permission-Prüfung serverseitig/PostgreSQL
- `service_role` wird nicht im Frontend verwendet
- Auth-Responses werden mit `Cache-Control: private, no-store` behandelt
- Supabase Security Advisor meldet aktuell nur `Leaked Password Protection Disabled`
- diese Funktion ist auf Supabase Pro+ verfügbar und wird spätestens vor Production aktiviert bzw. erneut bewertet
- MFA bleibt Production-Hardening-Pflicht

## Aktueller Deployment-Blocker
Beim Browser-Smoke-Test liefert `/login` die ZeyherMutterOS-404-Seite. Die Route ist auf `main` korrekt registriert. Damit läuft auf Cloudflare noch nicht der aktuelle Route-Stand bzw. ein neuerer Build wurde nicht erfolgreich aktiviert.

Deployment-Checkpoint: Dieser Commit dient bewusst als neuer Trigger für den Cloudflare-Git-Build.

Zu prüfen in Cloudflare:
1. Worker `zeyhermutter`
2. Builds / Deployments
3. neuester Build muss auf diesen bzw. einen neueren `main`-Commit zeigen
4. Build- und Deploy-Schritt müssen erfolgreich sein

## Nach erfolgreichem Deploy testen
1. `https://zeyhermutter.playsony.workers.dev/login` öffnen
2. mit dem angelegten STAGING-Benutzer anmelden
3. prüfen, ob `/crm` geladen wird
4. einen Testkontakt über `+ Kontakt` anlegen
5. Kontakt öffnen, einen Wert ändern und prüfen, ob die Historie die Änderung zeigt

## Danach automatisch
1. Kontaktrollen in der UI ergänzen
2. Kontaktbeziehungen ergänzen
3. Organisationen/Unternehmen ergänzen
4. Aufgaben/Wiedervorlagen mit Zuweisung implementieren
5. globale CRM-Suche und Duplikatprüfung erweitern
6. danach Modul 01 Abschlussprüfung gegen Definition of Done

## Production
Nicht angelegt / nicht verändert. Production bleibt bis zur ausdrücklichen Freigabe gesperrt.
