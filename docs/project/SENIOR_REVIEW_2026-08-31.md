# ZeyherMutterOS – Senior Review & Production Hardening

Datum: 31.08.2026
Scope: Module 01–05, Repository, Supabase STAGING, Cloudflare STAGING

## Ergebnis

Der geprüfte STAGING-Stand ist nach Behebung der P1-Funde build- und deployfähig. Es bestehen keine bekannten offenen P0-Funde. Ein PROD-Rollout wurde nicht durchgeführt, weil kein separates Supabase-PRODUCTION-Projekt existiert.

## Geprüfte Umgebungen

- GitHub: `zeyhermutter/zeyhermutter`, Branch `main`
- Supabase: `zeyhermutteros-staging`, Ref `zqhcxudpfwsfuokencvy`, `eu-central-1`, PostgreSQL 17
- Cloudflare: Worker `zeyhermutter`, Account `4196e568b62dcabd2125646072b6c4aa`
- STAGING: `https://zeyhermutter.playsony.workers.dev`
- PROD: nicht vorhanden

## Behobene P1-Funde

| Bereich | Fund | Korrektur | Nachweis |
|---|---|---|---|
| API-Sicherheit | `anon`/`authenticated` hatten zu breite Standardprivilegien | Least-Privilege-Grants und sichere Default Privileges | Rollen-/Funktionsrechte direkt geprüft; öffentliche Listing-RPC weiterhin nutzbar |
| Immobilie | `PREPARATION → MARKETING` prüfte fachliche Vollständigkeit nicht vollständig in der DB | vollständige Vermarktungsbereitschaft als Trigger-Invariante | positiver und negativer Rollback-Test als authentifizierter Nutzer |
| Modul 04 | Suchprofilanlage und Anfrageverknüpfung waren zwei nicht-atomare Client-Schritte | `create_search_profile_from_inquiry` als `SECURITY INVOKER`-Transaktion | Erfolgs- und Versionskonflikttest mit Rollback; keine Testdaten zurückgeblieben |
| Datenqualität | `ZM-A-000004` war ohne Objekt fälschlich `CLOSED` | gezielte, bedingte Migration auf `CONTACTED` | Status/Version nach Migration geprüft |
| Rollen | `admin` fehlten drei später eingeführte Lead-Rechte | `lead.archive`, `lead.assign`, `lead.convert` ergänzt | Admin fehlen jetzt 0 Permissions |
| Website-Medien | Worker puffert potenziell bis zu 100 MB als Blob | RLS-Autorisierung + kurzlebige Signed URL + Streaming | TypeScript, Build und Wrangler-Dry-Run bestanden |
| Modul 05 | Exposé-Route vorhanden, aber nicht erreichbar | Route und Immobiliennavigation integriert | Route im Build enthalten |
| Delivery | Browser- und Worker-Typen vermischt; kein reproduzierbarer Lockfile | getrennte TS-Projekte, generierte Worker-Typen, pnpm-Lockfile | zentrales `pnpm run check` grün |
| SEO-Basis | keine Robots/Sitemap/Canonical-Basis | Ressourcenrouten und Canonical ergänzt | Produktions-Build grün |

## Datenqualitätsprüfung

- keine doppelten fachlichen Nummern
- keine aktiven Eigentümeranteile über 100 %
- keine fehlenden Foreign-Key-Indizes und keine unvalidierten Constraints
- Dokumente und aktuelle Versionen konsistent; keine Dokumente ohne Version
- keine gefundenen Storage-Registrierungs-/Orphan-Abweichungen für Dokumente, Medien oder Exposés
- alle öffentlichen Tabellen haben RLS
- alle vier Buckets sind privat
- SECURITY-DEFINER-Helfer geprüft; private Helfer besitzen fixierten `search_path` und begrenzte Ausführungsrechte

## Qualitätsgates

- React-Router-Typgenerierung: PASS
- TypeScript Project References: PASS
- Vite Client-/SSR-Produktions-Build: PASS
- Wrangler Deploy Dry Run: PASS
- STAGING HTTP-Smoke `/`, `/immobilien`, `/kontakt`, `/login`: jeweils HTTP 200 vor dem Abschlussdeploy
- Supabase Security Advisor: kein kritischer Datenbankfund
- Supabase Performance Advisor: nur `unused_index`-Hinweise im jungen STAGING; bewusst nicht blind entfernt

## Offene Punkte

### Manuell / extern

- Supabase Auth `Leaked Password Protection` aktivieren: [Supabase Password Security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection)
- authentifizierte responsive Browser-Abnahme für Modul 04 und vollständiger Website-/Medien-/Exposé-Flow für Modul 05
- Vier-Augen-Regel fachlich entscheiden (andere Person zwingend oder nur Review-Metadaten)
- PROD-Projekt, Custom Domain, Backup-/Restore-Probe und Monitoring einrichten

### P2

- Dashboard-Abfragen aggregieren
- serverseitige Keyset-Pagination statt großer fester Clientlisten
- gemeinsame Adress-Schnelleingabe als Komponente
- Worker-Integrationstests und schrittweiser Abbau von `any`
- strukturierte SEO-Daten und konsistente 404/410-Regeln

## Relevante neue Migrationen

- `20260831141301_harden_api_role_privileges.sql`
- `20260831142555_enforce_property_marketing_readiness.sql`
- `20260831144452_repair_invalid_closed_inquiry_zm_a_000004.sql`
- `20260831144717_atomic_inquiry_search_profile_create.sql`
- `20260831145142_restore_admin_lead_permissions.sql`
