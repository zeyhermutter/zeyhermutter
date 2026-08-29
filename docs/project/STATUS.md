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
- Security Advisor: 0 Lints nach CRM-Migration
- Login/Logout-Routen
- geschützte `/crm`-Route
- responsive CRM-Dashboard-Shell
- alle ausgeführten Supabase-Migrationen im Repository gespiegelt

## Aktueller manueller Blocker
Supabase Auth enthält noch keinen Benutzer. Der erste Benutzer muss einmalig im Supabase-Dashboard angelegt werden. Danach kann ChatGPT Profilstatus und Geschäftsführerrolle über die vorhandene Supabase-Verbindung selbst konfigurieren.

## Danach automatisch
1. ersten Benutzer aktivieren
2. Rolle `managing_director` zuweisen
3. Berechtigungen/RLS mit echtem Benutzer prüfen
4. Login gegen STAGING testen
5. CRM Kontaktliste und Kontaktanlage implementieren
6. History-Ansicht pro Kontakt ergänzen
7. Optimistic-Locking-Konfliktfall umsetzen

## Production
Nicht angelegt / nicht verändert. Production bleibt bis zur ausdrücklichen Freigabe gesperrt.
