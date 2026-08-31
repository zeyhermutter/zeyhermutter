# ZeyherMutterOS – Produktions-Runbook

Stand: 31.08.2026

Das separate Supabase-PROD-Projekt `zeyhermutteros-production` (`vtmtxaaojbqqzwxkodye`, Frankfurt) ist angelegt und mit dem migrationsbasierten Datenbank-/Storage-Grundstand provisioniert. Der Cloudflare-PROD-Worker ist unter `https://zeyhermutter-production.playsony.workers.dev` live. Dieses Runbook bleibt die Freigabecheckliste; keine PROD-Ressource wird aus BETA abgeleitet oder still geteilt.

Aktueller Aufbauzustand:

- 73 Repository-Migrationen angewandt, Migrationshistorie ohne Drift
- alle Tabellen im exponierten `public`-Schema mit RLS; Advisor ohne Fehler
- privater Bucket `zm-public-media` mit kontrolliertem anonymem Lesen aktueller Veröffentlichungen und `property.write`-geschützten Uploads
- Edge Function `generate-property-expose` aktiv
- öffentlicher PII-Endpunkt `website-inquiry` nach gesonderter Freigabe als Version 1 mit `verify_jwt=false` aktiv; anonymer Honeypot-Smoke-Test bestanden
- keine BETA-Testdaten oder Auth-Nutzer nach PROD übernommen
- erster Worker-Rollout aus Git-SHA `a5287a3`, Cloudflare-Version `8ea58a97-3adb-423e-ba44-cfa5c71f337b`
- BETA-/PROD-Spiegeltest für Start, Login, Immobilien, Kontakt, Impressum, Datenschutz, Robots und Sitemap jeweils HTTP 200

Das verbindliche Branch-/Umgebungsmodell steht in `docs/operations/ENVIRONMENTS.md`: `develop` liefert BETA, `main` liefert PROD.

## 1. Freigaben vor der Anlage

- Supabase-Organisation und wiederkehrende Kosten ausdrücklich bestätigen. **Erledigt:** Organisation `czasoirrfhbyimtfudbq`, bestätigt mit 0 monatlich.
- PROD-Region festlegen. **Erledigt:** `eu-central-1` (Frankfurt), wie BETA.
- finale Domain/DNS-Zone und Cloudflare-Account bestätigen.
- Verantwortliche für Deployment, Rollback, Security und Datenschutz benennen.
- Go-live-Fenster, Akzeptanzkriterien und Kommunikationsweg festlegen.

## 2. Separate Infrastruktur

- neues Supabase-PRODUCTION-Projekt mit eigener Ref anlegen. **Erledigt:** `vtmtxaaojbqqzwxkodye`
- eigene Datenbank, Auth-Nutzer, Storage-Buckets und Edge Functions verwenden
- eigener Cloudflare-Worker/Environment und eigene Secrets/Vars
- niemals STAGING-Service-Keys, Buckets oder URLs wiederverwenden
- Git-Revision und freigegebenes Release-Tag dokumentieren

## 3. Datenbankaufbau

1. Backup-/Restore-Ziel und Aufbewahrung prüfen.
2. Alle versionierten Migrationen in Reihenfolge auf leerer PROD-Datenbank anwenden.
3. Migrationstabellen mit Repository vergleichen; keine Drift akzeptieren.
4. RLS, Grants, Default Privileges, Funktionsausführung und Storage Policies prüfen.
5. Rollen/Permissions bootstrappen; Admin muss 0 fehlende Permissions haben.
6. Keine STAGING-Test- oder personenbezogenen Daten übernehmen, sofern nicht gesondert freigegeben.

## 4. Auth und Storage

- finale Site-/Redirect-URLs setzen
- `Leaked Password Protection` aktivieren
- MFA-/Passwort-/Session-Policy festlegen
- vier private Buckets mit Limits und MIME-Regeln verifizieren
- Upload, Versionierung, Signed Download, öffentliche Medien und Exposé-Datei in PROD mit freigegebenen Testobjekten prüfen

## 5. Cloudflare-Release

1. `pnpm install --frozen-lockfile`
2. `pnpm run check:production`
3. PROD-Variablen auf eigene Supabase-Ref setzen; Runtime-Secrets separat setzen und keine Secretwerte loggen. **Publishable Konfiguration ist eingetragen.**
4. `DEPLOY_PRODUCTION=YES pnpm run deploy:production` ausschließlich auf sauberem `main` oder den manuellen GitHub-Workflow verwenden.
5. HTTP-Smoke, Login, Berechtigungsnegative und Kernflows durchführen.
6. Erst danach Custom Domain aktivieren und DNS kontrolliert umschalten.
7. Deployment-ID, Git-SHA, Zeitpunkt und ausführende Person dokumentieren.

## 6. Go-live-Abnahme

- öffentlich: Start, Immobilienliste/-detail, Kontakt, Impressum, Datenschutz, robots, sitemap, 404
- intern: Login/Logout, CRM, Objektanlage, Lead→Immobilie, Anfrage→Suchprofil, Besichtigung, Angebot, Veröffentlichung, Exposé
- Security: anon kann keine internen Tabellen/RPCs lesen; Rollennegative; RLS; Signed-URL-Ablauf
- Concurrency: parallele kritische Änderung liefert Konflikt und überschreibt nichts
- Monitoring: Worker-Fehler, Supabase API/Auth/DB/Storage/Edge-Function-Logs und Advisor prüfen

## 7. Rollback

- vor dem Go-live letzte stabile Worker-Version und Datenbank-PITR/Backup-Fähigkeit bestätigen
- bei reinem Webfehler Worker auf dokumentierte Vorgängerversion zurückrollen
- Datenbankmigrationen bevorzugt vorwärts korrigieren; destruktives Down-Migration-/Restore-Verfahren nur mit Incident-Freigabe
- DNS-Rückschaltung, Wartungsseite und interne Kommunikation vorbereiten
- personenbezogene Inkonsistenzen niemals durch unkontrolliertes Kopieren aus STAGING beheben

## 8. Nachkontrolle

- unmittelbar, nach 1 Stunde und am nächsten Arbeitstag Logs/Fehlerquote prüfen
- Security- und Performance-Advisor erneut ausführen
- Backup-/Restore-Probe terminieren
- offene P2-Funde in Backlog und Status nachführen
