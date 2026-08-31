# ZeyherMutterOS – Projektstatus

Stand: 31.08.2026

## Aktuelles Ziel
Modul 04 bleibt **IN ARBEIT** und wartet vor allem auf Browser-Smoke-Test/DoD. Parallel ist Modul 05 **Website & Exposés – IN ARBEIT** gestartet. Schwerpunkt des ersten Modul-05-Inkrements ist eine kontrollierte Publikationsschicht zwischen interner Objektakte und öffentlicher Website.

## Infrastruktur
- separates GitHub-Repository `zeyhermutter/zeyhermutter`
- separates Supabase-STAGING in Frankfurt
- Cloudflare-STAGING über `zeyhermutter.playsony.workers.dev`
- eigenständige ZeyherMutterOS-Infrastruktur
- Production nicht verändert

## Phase 0 – DONE
Architektur, Cloudflare, Supabase, Rollen/Permissions, Audit/Activity, RLS, Optimistic Concurrency und migrationsbasierte Entwicklung sind etabliert.

## Modul 01 · CRM – DONE
Kontakte, Organisationen, Beziehungen, Aufgaben, Activity, Kommentare/@Mentions, Benachrichtigungen, Suche, Archiv, History und Zwei-Benutzer-Akzeptanztest sind abgeschlossen.

## Modul 02 · Immobilien – DONE
Objektstammdaten, Statusmaschine, Eigentümer, Ausstattung, Energie, Checkliste, private Dokumente/Medien, Aufgaben, Suche, Audit/RLS und Browser-Smoke-Test sind abgeschlossen.

## Modul 03 · Eigentümer & Leads – DONE
Verkäufer-Pipeline, Bewertungsworkflow, Zusammenarbeit, Pflichtfeld-/Freigabelogik, atomare Lead→Immobilie-Konvertierung und Browser-Abnahme sind abgeschlossen.

## Modul 04 · Interessenten & Besichtigungen – IN ARBEIT
Technisch vorhanden sind inzwischen Suchprofile, Anfragen, regelbasiertes Matching, Matchentscheidungen, Besichtigungen, Feedback, Kaufangebote sowie die wesentliche Integration in Suche, Aufgaben, Activity und Collaboration. Serverseitige Rollback-Tests für Kernworkflow und Besichtigungs-/Angebotsworkflow sind grün. Offen bleiben insbesondere der vollständige Browser-Smoke-Test und die finale Definition-of-Done-Abnahme.

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
- SEO-Titel/-Beschreibung im Publikationssnapshot
- Snapshot enthält nur explizit öffentliche Objekt-, Lage-, Ausstattungs-, Energie- und freigegebene Medien-Metadaten; keine Storage-Pfade

### Migrationen Modul 05
- `20260831100149_module05_publication_versioning_foundation.sql`
- `20260831100722_module05_fix_publication_foreign_key_indexes.sql`

### Verifizierte Tests
- Entwurf ist anonym nicht sichtbar: PASS
- READY/Freigabeversion ist anonym nicht sichtbar: PASS
- PUBLISHED ist anonym sichtbar: PASS
- spätere interne Änderung lässt bisherigen veröffentlichten Snapshot unverändert live: PASS
- UNPUBLISHED entfernt öffentliche Sichtbarkeit: PASS
- stale Update wird nicht übernommen: PASS
- Rollback hinterließ 0 technische Publikationsdaten: PASS
- Security Advisor: keine neuen Modul-05-RLS/Security-Findings
- neue FK-Index-Findings wurden migrationsbasiert behoben

### Nächste Schritte Modul 05
1. kontrollierte öffentliche Bildauslieferung für `public_approved` Medien
2. Website-Anfrageformular direkt in `inquiries`
3. Exposé-Generator auf Basis derselben freigegebenen Snapshot-Version
4. Exposé-Historie/Freigabe und Download
5. Veröffentlichungsübersicht und bessere Navigation aus der Objektakte
6. Browser-Smoke-Test und DoD

## Offener externer Security-Punkt
Supabase Auth meldet weiterhin `Leaked Password Protection Disabled`. Remediation: https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection

## Production
Production wurde nicht verändert und bleibt bis zur ausdrücklichen Freigabe gesperrt.
