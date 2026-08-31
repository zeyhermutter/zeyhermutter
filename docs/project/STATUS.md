# ZeyherMutterOS – Projektstatus

Stand: 31.08.2026

## Aktuelles Ziel
Phase 3 / Modul 03 Eigentümer & Leads – Verkäufer-Lead-Pipeline, Bewertungsworkflow und kontrollierter Lead→Immobilie-Workflow auf STAGING. Technische Implementierung ist weitgehend abgeschlossen; Cloudflare-/Browser-Abnahme steht noch aus.

## Infrastruktur
- separates GitHub-Repository `zeyhermutter/zeyhermutter`
- separates Supabase-STAGING in Frankfurt
- Cloudflare-STAGING über `zeyhermutter.playsony.workers.dev`
- eigenständige ZeyherMutterOS-Infrastruktur
- Production nicht verändert

## Phase 0 – DONE
- Cloudflare Workers + GitHub-Deployment
- Supabase PostgreSQL/Auth/Storage/RLS
- Rollen + granulare Permissions
- append-only AuditLog + Activity
- Optimistic Concurrency
- migrationsbasierte Datenbankänderungen
- Security-/Performance-Advisor im Entwicklungsprozess
- zwei echte Geschäftsführerkonten

## Modul 01 · CRM – DONE
- Kontakte und strukturierte Adressen
- Organisationen
- Rollen, Personen- und Firmenbeziehungen
- Aufgaben/Wiedervorlagen mit Benutzerzuweisung
- Activity Feed
- Kommentare / @Mentions
- Notification Inbox
- Duplikaterkennung
- globale Suche
- Archivieren/Wiederherstellen
- feldgenaue History
- globale Systemhistorie
- Optimistic Locking
- Zwei-Benutzer-Akzeptanztest und direkte RLS-/Permission-Tests

## Modul 02 · Immobilien – DONE
- Objektkern, Statusmaschine, Adresse, Eigentümer, Ausstattung und Energiedaten
- Vermarktungscheckliste
- private Dokumente mit append-only Versionen, SHA-256 und Signed Download
- private Medienbibliothek
- Aufgaben-/Such-/Audit-Integration
- RLS, sensible Permissions und Optimistic Locking
- vollständige serverseitige Rollback-/Integritätstests
- vollständiger Browser-Smoke-Test
- Definition of Done erfüllt

## Modul 03 · Eigentümer & Leads – IN ARBEIT

### Lead-Kern
- automatische Leadnummer `ZM-L-######`
- bestehender CRM-Kontakt als Identität; mehrere Leads pro Kontakt möglich
- Quellenmodell getrennt vom Bearbeitungsstatus
- Pipeline: NEW / CONTACTED / QUALIFIED / APPOINTMENT / VALUATION / OFFER / WON / LOST / NURTURE
- PostgreSQL validiert erlaubte Statusübergänge
- LOST benötigt Verlustgrund
- verantwortlicher Benutzer und Wiedervorlage
- Consent-Dokumentation
- Archivieren/Wiederherstellen
- Optimistic Concurrency über `version`

### Objekt- und Bewertungsanfrage
- Straße, Hausnummer, PLZ, Ort, Ortsteil und Land
- Immobilientyp
- Baujahr, Wohnfläche, Grundstücksfläche und Zimmer
- Zustand und Belegung
- Verkaufshorizont und Preisvorstellung
- Nachricht/Hintergrund und interne Notizen
- Bewertungstermin
- geschätzter Marktwert als PostgreSQL `numeric`
- Bewertungsnotiz
- Angebotszeitpunkt
- angebotene Provision als PostgreSQL `numeric`
- Angebotskonditionen
- Eingaben akzeptieren deutsche Dezimalformate sowie Punkt-Dezimalnotation

### UI
- `/leads` Verkäufer-Lead-Verzeichnis
- Pipeline-Übersicht mit Anzahl und überfälligen Wiedervorlagen je Stufe
- Filter nach Status, Quelle, Verantwortlichem, Wiedervorlage und Archiv
- Suche nach Leadnummer, Kontakt, Telefon/E-Mail und Objektadresse
- Pagination
- `/leads/new` Lead-Neuanlage
- `/leads/:leadId` zentrale Leadakte
- serverseitig validierte Statusaktionen statt unsicherem Client-only Drag & Drop
- Bewertungsdaten, Wiedervorlage, Zuständigkeit, Activity, Kommentare, @Mentions, Audit und Archiv in der Leadakte

### Aufgaben / Suche / Dashboard / Notifications
- `tasks.lead_id` mit Leadbezug
- Aufgabe direkt aus Leadakte erzeugbar
- globale Aufgabenliste zeigt Leadnummer und Rücklink
- `crm_global_search` findet Leads über Nummer, Kontakt, E-Mail, Telefon/Mobil und Objektadresse
- Suchergebnisart `LEAD` öffnet die Leadakte
- CRM-Dashboard zeigt offene/neue/überfällige Verkäufer-Leads und aktuelle Leads
- @Mention-Notifications öffnen die Leadakte

### Lead → Immobilie
- RPC `convert_lead_to_property`
- benötigt `lead.convert` und erforderliche Immobilienberechtigungen
- nur für nicht archivierte Leads im Status WON
- erwartete Lead-Version wird geprüft
- idempotent: bereits konvertierter Lead erzeugt keine zweite Immobilie
- neue Immobilie erhält die reguläre Objektnummer und startet in DRAFT
- Kontakt wird als 100%-Eigentümer übernommen
- vollständige Lead-Adresse wird übernommen
- relevante Objektwerte und Verantwortlicher werden übernommen
- Lead erhält `converted_property_id`, `converted_at`, `converted_by`
- Activity-Eintrag wird erzeugt
- gesamte Konvertierung läuft atomar in PostgreSQL

### Migrationen Modul 03
- `20260831060527_lead_core_foundation.sql`
- `20260831060752_optimize_lead_rls_and_fk_indexes.sql`
- `20260831064330_complete_lead_workflow_core.sql`

### Verifizierte technische Tests Modul 03
- Lead-Kernpfad inkl. Statusmaschine / LOST / Archiv / Kommentare / Mentions / Aufgaben / Activity / Audit: PASS
- Lead→Immobilie inkl. Idempotenz: PASS
- Übernahme von Immobilie, Adresse und 100%-Eigentümer: PASS
- Lead-Aufgabenbezug: PASS
- globale Lead-Suche: PASS
- `lead.read` ohne `lead.write`: Lesen möglich, Schreiben blockiert
- `lead.write` ohne `lead.assign`: Zuständigkeitswechsel blockiert
- ohne `lead.archive`: Archiv/Restore blockiert
- ohne `lead.convert`: Konvertierung blockiert
- stale-version / Concurrent Editing: PASS; neuerer Wert wird nicht überschrieben
- Tests liefen mit Rollback; keine technischen Test-Leads blieben bestehen

### Advisor-Status
- nach DDL keine neuen RLS-, FK- oder Function-Warnungen
- Performance Advisor: nur erwartbare `unused index`-Infos im jungen STAGING
- Security Advisor: weiterhin nur `Leaked Password Protection Disabled` als externe Auth-Konfiguration

## Noch offen für Modul 03 DONE
1. aktuellen `main`-Stand auf Cloudflare bauen/deployen und im Browser sichtbar bestätigen
2. Browser-Smoke-Test Lead anlegen und bearbeiten
3. Status/Wiedervorlage/Aufgabe/Kommentar/@Mention/Notification prüfen
4. Pipeline, Archiv/Restore und globale Suche prüfen
5. gewonnenen Lead im Browser zu Immobilie konvertieren
6. neue Immobilie öffnen und Eigentümer-/Objektübernahme prüfen
7. Browser-Concurrency-Test mit zwei Tabs/Sessions
8. danach Modul-03-DoD abschließen

## Offener externer Security-Punkt
Supabase Auth meldet weiterhin `Leaked Password Protection Disabled`. Diese Projekt-Auth-Einstellung ist kein Datenmodell-/Modulfehler und muss separat in der Supabase-Projektkonfiguration aktiviert werden, sobald gewünscht/verfügbar.

## Production
Production wurde nicht verändert und bleibt bis zur ausdrücklichen Freigabe gesperrt.
