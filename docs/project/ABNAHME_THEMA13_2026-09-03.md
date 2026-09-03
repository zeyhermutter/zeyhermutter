# Thema 13 · Systemweite Produktionsreife — Abnahme

Datum: 03.09.2026
Umgebung: **ausschließlich BETA** (Supabase `zqhcxudpfwsfuokencvy`, Cloudflare Worker `zeyhermutter`)
Branch: `codex/verkaufsfertig-positionierung`
Ausgangsstand: `500acaf` (enthält `7b5a10d` als Vorfahre)
PROD (`vtmtxaaojbqqzwxkodye`, `zeyhermutter-production`, `main`, `develop`): **unverändert**

Dieses Thema hat keine neuen Features entwickelt. Es wurde geprüft; behoben wurden
ausschließlich Darstellungsfehler, die der Abnahme im Weg standen.

---

## 1. Prüfumfang und Methode

* Statische Prüfung des gesamten Anwendungscodes (75 Routen, 39 Stylesheets, 101 Migrationsdateien).
* Datenbankprüfung auf Supabase-BETA: Tabellen, RLS, Policies, Grants, Trigger, Constraints,
  Versionierung, Audit, Security- und Performance-Advisor.
* Authentifizierte Browser-Abnahme aller CRM-Bereiche (Anmeldung durch den Benutzer freigegeben)
  bei 1366 px und 390 px Breite, inklusive automatisierter Prüfung auf horizontale Überläufe
  und auf verbliebene dunkle Flächen im hellen CRM.
* Öffentliche Website inklusive Immobilienangebot, Kontaktformular und Verkaufsstrategie-Check.
* Build-Kette: `check:brand-logo`, `typecheck`, `build:beta`, `wrangler deploy --dry-run`.

## 2. Behoben in diesem Durchlauf

Nur Farben, Kontraste und Textumbruch. Keine Änderungen an Kachelgrößen, Grid, Abständen,
Navigation, Datenmodell, Fachlogik oder Berechtigungen.

| Fund | Ort | Korrektur |
|---|---|---|
| Verkäufer-Pipeline vollständig dunkel und kontrastarm | `/leads` | helle Kacheln, lesbare Sekundärtexte, semantische Gewonnen-/Verloren-Farben |
| Objektstatus-Badges dunkel | `/leads` | helle Badges mit bestehender Semantik |
| Kontextnavigation der Immobilienakte dunkel | alle `/properties/:id/*` | helle Leiste mit sichtbarem Active-State |
| Benachrichtigungsglocke im Dashboard dunkel (inkl. Popover) | `/crm` | helle Glocke, helles Popover |
| Kartenpopup und Attribution der Immobilienkarte dunkel | Immobilienübersicht | helles Popup |
| Build-Stempel „Stand …“ lag dunkel über der CRM-Seitenleiste | alle CRM-Seiten | unten rechts, hell |
| Lange ungetrennte Zeichenketten sprengen Karten und erzeugen horizontalen Seiten-Scroll | öffentliche Objektliste und Objektdetailseite | `overflow-wrap: anywhere` |
| Gleicher Effekt vorsorglich im CRM | `data-card`-Inhalte | `overflow-wrap: anywhere` |

Technische Ursache zweier Funde: `.property-context-nav` und `.build-version` werden außerhalb
von `.persistent-app-frame` gerendert. Die bestehenden Overrides des hellen Themes greifen dort
nicht; die Korrektur nutzt deshalb `body:has(.persistent-app-frame)`.

## 3. Bewusst unverändert

* Datenmodell, Relations, Statusmaschinen, RPCs, RLS, Rollen und Rechte.
* Bestehende Demo-/Bestandsdaten auf BETA (siehe C-2) — kein Löschen ohne Freigabe.
* `SALES_READINESS_AI_ENABLED=true` auf BETA: der Endpunkt bleibt ohne OpenAI-Key
  funktionslos (`AI_NOT_CONFIGURED`), der Workflow bleibt „Prompt erzeugen → kopieren → selbst einfügen“.
* Migrationen: keine neuen angelegt, um den bestehenden Versionsversatz (C-1) nicht zu vergrößern.
* Kachelgrößen, Grids, Abstände, Navigation, Seitenstruktur.

---

## 4. Abschlussliste

### A · Produktionsreif

Fachlich vollständig, technisch abgesichert, in der Abnahme ohne Befund.

* **Kontakte, Organisationen, Beziehungen** — RLS, Archiv, Audit, Version, Duplikatprüfung.
* **Aufgaben inkl. Watcher** — Verantwortlichkeit und Beobachtung getrennt, Benachrichtigungen gehärtet.
* **Immobilien (Objektakte, Status, Eigentümer, Energie, Ausstattung, Checkliste)** — Statusmaschine
  `MARKETING → RESERVED → NOTARY → SOLD` datenbankseitig erzwungen, Vermarktungsreife wird geprüft.
* **Dokumente und Dokumentversionen** — Storage-Integrität, aktuelle Version geschützt, Archivrecht.
* **Medien** — privater Bucket, kontrollierte öffentliche Auslieferung über Signed URL.
* **Exposés** — versionierter Arbeitsbereich, Vorschau, PDF aus konkreter Publikationsversion.
* **Publikationen / Vermarktung & Portale** — append-only Snapshots, Kanalstatus, keine vorgetäuschte Portal-API.
* **Verkäufer-Leads** — Pipeline, Bewertung, atomare Konvertierung, eingefrorene Geschäftsdaten.
* **Verkaufsstrategie-Checks** — Entwurf, Szenarien, Maßnahmen, Prüfstatus, kontrollierte Finalisierung,
  Revisionen, Medien revisionsfest, idempotente Aufgabenerzeugung.
* **Suchprofile, Anfragen, Besichtigungen** — Statusmaschinen und Korrekturpfade.
* **Interessenten-Matching** — nachvollziehbare Gründe, Entscheidungen werden berücksichtigt.
* **Kaufangebote, Abschluss & Notar** — Angebotsnummern, Folgeangebote, Abschlussakte, Notarprozess.
* **Provisionen** — Innen-/Außenprovision, Prozent oder Festbetrag, Statuswechsel protokolliert.
* **Reporting & Controlling** — nur reale Geschäftsdaten, Zeitfilter, getrennte Grants.
* **Benutzer, Rollen & Berechtigungen** — Selbst-Eskalation serverseitig blockiert,
  Admin-Rolle nur durch Administrator, Optimistic Concurrency, Änderungen im Audit (`entity_type = USER`).
* **Website-CMS** — versionierte Seiten mit Vorschau; öffentliche Immobilien bleiben im Immobilienmodul.
* **Suche, Archiv, Historie, Benachrichtigungen**.
* **Öffentliche Website**: Startseite, Kontaktformular, öffentlicher Verkaufsstrategie-Check,
  `robots.txt`, `sitemap.xml`; unbekannte Objekt-Slugs liefern sauber 404; `/__preview/sales-readiness`
  ist auf BETA korrekt 404 (nur localhost); `/homepage-varianten` ist auf PROD gesperrt.
* **Technische Grundlagen**: RLS auf allen 61 Tabellen aktiv, Version/Actor/Trigger auf allen
  Geschäftstabellen, keine horizontalen Seiten-Scrollfehler auf 1366 px und 390 px,
  Typecheck und BETA-Build fehlerfrei.

### B · Funktional, aber noch zu verbessern

* **B-1 Kopfbereich der öffentlichen Website uneinheitlich.** `/immobilien` und die Objektdetailseite
  nutzen einen älteren „ZM“-Textkopf, alle übrigen öffentlichen Seiten den Navy-Kopf mit Logo.
* **B-2 Anmeldeseite weiterhin dunkel.** Inhaltlich korrekt, passt aber weder zum hellen CRM
  noch zur Navy-CI der Website.
* **B-3 Zwei Benachrichtigungsglocken.** Seitenleiste und Dashboard-Kopf zeigen dieselbe Funktion.
  Jetzt einheitlich hell, aber redundant.
* **B-4 Performance-Advisor BETA:** ein doppelter Index auf `lead_sales_readiness_scenarios`
  (`lead_sales_readiness_one_recommendation_idx` / `…_recommended_idx`), sechs Fremdschlüssel ohne
  deckenden Index (`lead_sales_readiness_media`, `sales_readiness_public_intake_config`,
  `website_pages`, `website_page_versions`), vier `auth_rls_initplan`-Hinweise auf den
  `…_insert`-Policies der Verkaufsstrategie-Tabellen. Keine Fehlfunktion, nur Effizienz.
* **B-5 `check:brand-logo` prüft zu wenig.** Nur PNG-Signatur und Maße, nicht die Bilddaten —
  deshalb konnte C-3 unbemerkt durch alle Quality Gates.
* **B-6 Audit-Entity-Typen uneinheitlich.** Ein Datensatz mit `entity_type = 'profile'` klein
  geschrieben gegenüber sonst durchgängig Großschreibung.
* **B-7 Dunkle Basis-Stylesheets bleiben bestehen.** `crm.css`, `sales-readiness*.css`,
  `property-documents.css`, `property-context-nav.css`, `property-map.css` sind weiterhin dunkel
  und werden durch zwei Override-Dateien hell gezogen. Funktioniert, ist aber fehleranfällig:
  jedes neue Element in diesen Dateien erscheint zunächst dunkel.
* **B-8 SECURITY-DEFINER-Hinweise.** `finalize_lead_sales_readiness_check` und
  `create_lead_sales_readiness_revision` sind für `authenticated` ausführbar. Fachlich gewollt
  (beide prüfen Rechte intern), bleibt aber ein bewusst getragener Hinweis.
* **B-9 Leaked Password Protection** in Supabase-BETA-Auth deaktiviert.

### C · Vor PROD zwingend offen

* **C-1 Migrationshistorie und Repository laufen auseinander.**
  Sechzehn lokale Migrationsdateien haben andere Versionsnummern als die auf BETA verbuchten
  (z. B. `20260901124500_commission_module.sql` lokal gegen `20260901125409` remote), und
  `20260901185000_interest_matching_priority.sql` ist auf BETA inhaltlich vorhanden, aber gar nicht
  in `supabase_migrations.schema_migrations` verbucht. Das Repository ist damit **nicht** die
  nachweisbare Quelle des BETA-Schemas. Vor einem PROD-Rollout muss die Historie begradigt und
  ein Aufbau aus dem Migrationsordner auf einer leeren Datenbank verifiziert werden.
* **C-2 Synthetische und Demodaten auf BETA.**
  Nicht gelöscht, weil sie die BETA-Demo-Umgebung sind — sie dürfen aber nicht nach PROD gelangen:
  10 Organisationen (Muster/Demo/Beispiel/Fiktiv/Testbau/Platzhalter), 10 Kontakte auf
  `@example.invalid` (ZM-K-000028 bis 000037), die Objekte ZM-2026-0005 bis 0007
  („MUSTERHAUS Am Birkenweg“ u. a.) sowie manuelle Testreste
  (Kontakte ZM-K-000002 „Test, Test“, ZM-K-000017, ZM-K-000044; Objekte ZM-2026-0001 „Test“,
  ZM-2026-0003 „TestIMMO 1“, ZM-2026-0004 „test3“; Aufgaben „fasd“, „start suchen“).
  **Positiv geprüft:** keine Migration legt Demodaten an — PROD ist aus den Migrationen heraus sauber.
* **C-3 Marken-Logo im öffentlichen Kopfbereich ist defekt.**
  `brandLogoDataUri` in `app/brand-logo-data/index.ts` ist eine beschädigte JPEG-Data-URI
  (Marker-Desync ab Byte 158, `naturalWidth = 0`); die aus `part1`–`part8` zusammengesetzte PNG
  ist ebenfalls beschädigt (gültige Signatur und IHDR 378×185, defekter Datenstrom).
  Auf `/`, `/kontakt`, `/impressum`, `/datenschutz` und `/verkaufsfertig-check` erscheint ein
  Kaputt-Bild-Symbol. Nach Absprache nicht selbst ersetzt — die Originaldatei wird nachgeliefert.
* **C-4 Öffentlich sichtbare Platzhaltertexte in veröffentlichten Objekten.**
  Die live veröffentlichten Objekte enthalten Beschreibungen wie
  `gdfdgfsafsdadfssfadfasdfdfsgdf…` und `asfdjnjlöafkjASFDVFVSDA` sowie ein sachfremdes Titelbild.
  Auf BETA vertretbar, vor PROD zwingend zu ersetzen oder zu depublizieren.
* **C-5 CI hinterlässt einen synthetischen Datensatz.**
  `.github/workflows/deploy-beta.yml` erzeugt bei jedem Push über die Edge Function
  `website-inquiry` einen SELLER_CHECK mit `synthetic.salesreadiness.beta@example.invalid`
  (fester `submission_key`, deshalb dedupliziert) und räumt ihn nicht auf. Für PROD ist ein
  solcher Smoke-Test entweder zu unterlassen oder mit automatischer Bereinigung zu versehen.
* **C-6 Thema 5 „Dokumente & Unterlagenmanagement“ wurde nicht umgesetzt.**
  Es existiert keine Struktur für Unterlagenanforderungen je Objektart mit den Zuständen
  „vorhanden / angefordert / fehlt / nicht erforderlich / zu prüfen / geprüft / veraltet“ und
  keine Verknüpfung solcher Anforderungen mit Aufgaben. `documents` besitzt keine Statusspalte;
  `property_marketing_checklist_items` deckt nur die Vermarktungs-Checkliste ab.
  Es gibt zu diesem Thema auch keinen Commit. Vor der PROD-Freigabe ist zu entscheiden, ob das
  Thema nachgeholt oder bewusst zurückgestellt wird.

---

## 5. Ergebnis der Build- und Deploymentkette

* `pnpm run check:brand-logo` — bestanden (prüft jedoch nur Signatur und Maße, siehe B-5)
* `pnpm run typecheck` — fehlerfrei
* `pnpm run build:beta` — erfolgreich
* `wrangler deploy --dry-run` — Ziel `zeyhermutter`, `APP_ENV=beta`,
  `SUPABASE_URL=https://zqhcxudpfwsfuokencvy.supabase.co`; keine PROD-Referenz
* Deployment auf BETA über den GitHub-Actions-Workflow `Deploy BETA` (Push auf
  `origin/codex/verkaufsfertig-positionierung`); kein Merge nach `develop` oder `main`

## 6. Rollback

* Cloudflare-BETA: Rücknahme des Commits und erneuter Push, oder Rollback auf die zuvor
  ausgelieferte Version `500acaf`.
* Datenbank: keine Migration angewendet, daher keine Datenbank-Rücknahme erforderlich.
