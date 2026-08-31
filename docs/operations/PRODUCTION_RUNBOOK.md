# ZeyherMutterOS – Produktions-Runbook

Stand: 31.08.2026

PROD existiert noch nicht. Dieses Runbook ist die Freigabecheckliste; keine PROD-Ressource wird aus STAGING abgeleitet oder still geteilt.

Das verbindliche Branch-/Umgebungsmodell steht in `docs/operations/ENVIRONMENTS.md`: `develop` liefert BETA, `main` liefert PROD.

## 1. Freigaben vor der Anlage

- Supabase-Organisation und wiederkehrende Kosten ausdrücklich bestätigen.
- PROD-Region festlegen; für Datenresidenz bevorzugt dieselbe EU-Region wie STAGING.
- finale Domain/DNS-Zone und Cloudflare-Account bestätigen.
- Verantwortliche für Deployment, Rollback, Security und Datenschutz benennen.
- Go-live-Fenster, Akzeptanzkriterien und Kommunikationsweg festlegen.

## 2. Separate Infrastruktur

- neues Supabase-PRODUCTION-Projekt mit eigener Ref anlegen
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
3. PROD-Variablen/Secrets auf eigene Supabase-Ref setzen; keine Secretwerte loggen.
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
