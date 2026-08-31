# ZeyherMutterOS – Projektstatus

Stand: 31.08.2026

## Aktuelles Ziel
Der Senior Review für Module 01–05 ist technisch auf STAGING abgeschlossen. P0-Funde bestehen nicht mehr; die gefundenen P1-Funde wurden behoben und geprüft. Modul 04 und Modul 05 bleiben bis zur echten responsiven bzw. vollständigen Browser-Abnahme formal **IN ARBEIT**.

## Infrastruktur
- separates GitHub-Repository `zeyhermutter/zeyhermutter`
- separates Supabase-STAGING in Frankfurt
- Cloudflare-STAGING über `zeyhermutter.playsony.workers.dev`
- eigenständige ZeyherMutterOS-Infrastruktur
- Supabase-API-Rollen auf minimale Tabellen-/Sequenz-/RPC-Rechte reduziert
- reproduzierbarer pnpm-Lockfile sowie getrennte Browser-/Worker-TypeScript-Projekte
- Production nicht vorhanden und nicht verändert

## Phase 0 – DONE
Architektur, Cloudflare, Supabase, Rollen/Permissions, Audit/Activity, RLS, Optimistic Concurrency und migrationsbasierte Entwicklung sind etabliert.

## Modul 01 · CRM – DONE
Kontakte, Organisationen, Beziehungen, Aufgaben, Activity, Kommentare/@Mentions, Benachrichtigungen, Suche, Archiv, History und Zwei-Benutzer-Akzeptanztest sind abgeschlossen.

## Modul 02 · Immobilien – DONE
Objektstammdaten, Statusmaschine, Eigentümer, Ausstattung, Energie, Checkliste, private Dokumente/Medien, Aufgaben, Suche, Audit/RLS und Browser-Smoke-Test sind abgeschlossen.

## Modul 03 · Eigentümer & Leads – DONE
Verkäufer-Pipeline, Bewertungsworkflow, Zusammenarbeit, Pflichtfeld-/Freigabelogik, atomare Lead→Immobilie-Konvertierung und Browser-Abnahme sind abgeschlossen.

## Modul 04 · Interessenten & Besichtigungen – IN ARBEIT

### Aktueller Funktionsstand
- Interessenten bleiben CRM-Kontakte; mehrere Suchprofile je Kontakt
- Suchprofile mit Pflicht-Suchort, Radius, PLZ/Ort/Ortsteil und serverseitiger Validierung
- Altbestand mit numerischer PLZ im falschen Ortsfeld wird normalisiert
- Matching Suchprofil → Immobilie mit nachvollziehbaren Gründen
- gleiche PLZ wird explizit als Standorttreffer bewertet
- Reverse Matching Immobilie → passende Interessenten nutzt dieselbe Matching-Engine
- Anfragen inklusive Statusmaschine und Suchprofil-Verknüpfung
- Anfrage → neues Suchprofil inklusive Rückverknüpfung atomar in einer Transaktion
- Besichtigungen mit Kontextübernahme aus Anfrage/Suchprofil/Immobilie/Reverse Match
- kontrollierter Korrekturpfad für versehentlich „Durchgeführt“
- Feedback
- Kaufangebote mit `ZM-KA-######`, Folgeangeboten und Historie
- nur ein aktuell aktives abgegebenes Angebot je Kontakt + Immobilie
- Aufgaben mit lesbaren fachlichen Bezügen und Aufgabenmodal
- gemeinsame deutsche Status-/Prioritätsdarstellung
- einheitliches ca. 1120-px-Inhaltsraster für die überarbeiteten Modul-04-Bereiche

### Technische Abnahme des Fixblocks
- M04-17 ungültiger Inquiry-Statussprung: PASS
- M04-45 Suchprofil read-only / write blockiert: PASS
- M04-46 Anfrage read-only / write blockiert: PASS
- M04-47 Archiv-Permission Suchprofil + Anfrage: PASS
- M04-48 API-/DB-Bypass-Regeln: PASS für geprüfte Inquiry-, Suchprofil-, Besichtigungs- und Kaufangebotsregeln
- exakt gleiche Suchprofil-/Immobilien-PLZ: PASS, Match-Begründung `PLZ entspricht Suchgebiet`
- Suchprofil ohne Suchort bei direktem Tabellen-Bypass: blockiert
- ungültiger Suchradius: blockiert
- falscher Kontaktbezug bei Besichtigung: blockiert
- abgegebenes Kaufangebot nachträglich verändern: blockiert
- Folgeangebot ersetzt vorheriges aktives Angebot: PASS
- nach Rollback-Tests bleiben keine technischen Testdatensätze zurück
- historisch inkonsistente Anfrage `ZM-A-000004` gezielt von `CLOSED` auf `CONTACTED` zurückgesetzt

### Relevante Migrationen des Browser-Fixblocks
- `20260831120356_module04_browser_acceptance_fixes_core.sql`
- `20260831123129_module04_reverse_matching_details.sql`
- `20260831123907_module04_search_location_postal_normalization.sql`
- `20260831124952_module04_search_profile_location_commit_guard.sql`
- `20260831144452_repair_invalid_closed_inquiry_zm_a_000004.sql`
- `20260831144717_atomic_inquiry_search_profile_create.sql`

### Advisor
Security Advisor zeigt keinen kritischen Datenbankfund. Die policylose Tabelle `public_form_rate_limits` gehört zum service-only Website-Intake von Modul 05 und ist absichtlich nicht direkt nutzbar. Die bekannte Supabase-Auth-Warnung `Leaked Password Protection Disabled` bleibt als manuelle Projekteinstellung offen.

Performance Advisor zeigt ausschließlich `unused index`-Hinweise im jungen STAGING; diese werden nicht blind entfernt.

### Noch offen vor DONE
1. M04-49 Responsive Browser-Abnahme durch den Nutzer
2. M04-50 kompletter End-to-End-Browser-Test durch den Nutzer
3. danach Modul-04-DoD final bewerten

## Modul 05 · Website & Exposés – IN ARBEIT

### Architektur
Die öffentliche Website liest nicht direkt aus `properties`. Pro Immobilie gibt es eine separate `property_publications`-Arbeitsakte. Eine Freigabe erzeugt einen unveränderlichen Snapshot in `property_publication_versions`. Nur die aktuelle tatsächlich veröffentlichte Version ist anonym lesbar.

Damit gilt:
- interne Objektänderungen verändern eine Live-Veröffentlichung nicht stillschweigend,
- neue Inhalte müssen erneut als Version vorbereitet und veröffentlicht werden,
- private Eigentümer-, Notiz- und Dokumentdaten gelangen nicht in den öffentlichen Snapshot,
- die öffentliche Adresse wird gemäß `public_address_mode` reduziert,
- der Freigabeschritt benötigt serverseitig `property.publish`.

### Bereits umgesetzt
- `property_publications`
- append-only `property_publication_versions`
- DRAFT / READY / PUBLISHED / UNPUBLISHED Workflow
- Optimistic Concurrency auf der Veröffentlichungsakte
- Audit-History
- anonyme RLS nur für `is_current_public=true`
- öffentliche RPCs `public_property_listings()` und `public_property_by_slug()` als `SECURITY INVOKER`
- interne Route `/properties/:propertyId/publication`
- öffentliche Liste `/immobilien`
- öffentliche Detailseite `/immobilien/:slug`
- kontrollierte öffentliche Medien-Grundlage
- Website-Anfrage-Intake in das bestehende CRM-/Inquiry-Modell
- Exposé-Datenmodell und PDF-Generator-Grundlage auf Basis einer konkreten Publikationsversion
- Exposé-UI/Route `/properties/:propertyId/exposes` und Immobiliennavigation
- `robots.txt`, dynamische `sitemap.xml` und Canonical-Link der öffentlichen Detailseite
- öffentliche Medien werden aus dem privaten Bucket über eine 30-Sekunden-Signed-URL gestreamt und nicht im Worker gepuffert
- Datenbank erzwingt die Vermarktungsbereitschaft vor `PREPARATION → MARKETING`

### Noch offen Modul 05
- vollständiger authentifizierter Browser-Smoke-Test Veröffentlichung/Medien/Anfrage/Exposé
- Freigabeentscheidung, ob Vier-Augen-Prüfung zwingend von einer anderen Person erfolgen muss
- Modul-05-DoD

## Offener externer Security-Punkt
Supabase Auth meldet weiterhin `Leaked Password Protection Disabled`. Remediation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Production
Ein Supabase-PRODUCTION-Projekt existiert noch nicht. Deshalb wurden weder Datenbank noch Worker nach PROD ausgerollt. Anlage und erster Rollout folgen ausschließlich dem Produktions-Runbook nach Kosten-, Organisations- und Domainfreigabe.
