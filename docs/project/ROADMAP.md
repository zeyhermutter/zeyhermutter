# ZeyherMutterOS – Roadmap

## Ziel
ZeyherMutterOS wird als produktionsfähige, sichere und nachvollziehbare Plattform für den gemeinsamen Betrieb einer Immobilienmaklerfirma entwickelt.

## Arbeitsweise
- STAGING zuerst, Production nur nach ausdrücklicher Freigabe.
- SeasonCrew bleibt technisch vollständig getrennt.
- Kleine, abgeschlossene Inkremente statt großer unkontrollierter Rewrites.
- Architektur-, Security- und Datenintegritätsentscheidungen werden dokumentiert.
- Tests erfolgen risikobasiert.

## Phasen

### Phase 0 – Architektur & Infrastruktur — DONE
- [x] separates GitHub-Repository
- [x] separates Supabase-STAGING in Frankfurt
- [x] Cloudflare Worker + workers.dev Deployment
- [x] Rollen-/Permission-Grundmodell
- [x] Audit-/Activity-Grundmodell
- [x] RLS-Basis
- [x] Optimistic-Concurrency-Grundsatz
- [x] reproduzierbare Migrationen vollständig im Repository
- [x] Auth-Flow für zwei Geschäftsführer
- [x] Security-/RLS-Basistests
- [x] Architektur-Dokumentation

### Phase 1 – CRM — DONE
- [x] Kontakte
- [x] strukturierte Kontaktadressen
- [x] Organisationen
- [x] Kontaktrollen
- [x] Personen- und Firmenbeziehungen
- [x] Aktivitäten
- [x] Aufgaben/Wiedervorlagen
- [x] Benutzerzuweisung
- [x] Kommentare/@Mentions
- [x] Benachrichtigungs-Inbox
- [x] Duplikaterkennung
- [x] globale Suche
- [x] Archivieren/Wiederherstellen
- [x] History pro Datensatz und globale Systemhistorie
- [x] Concurrent Editing / Optimistic Locking
- [x] Zwei-Benutzer-Akzeptanztest

### Phase 2 – Immobilien — DONE
- [x] Objektstammdaten-Datenmodell
- [x] automatische Objektnummer `ZM-YYYY-####`
- [x] validierte Objektstatusmaschine
- [x] interne Adresse + öffentliche Adressfreigabe
- [x] Eigentümerrelationen inkl. Anteilen
- [x] flexible Ausstattung
- [x] Energiedaten
- [x] Vermarktungscheckliste
- [x] Aufgaben mit Objektbezug
- [x] Immobilien in globaler Suche
- [x] Dokument-Metadaten und append-only Versionen
- [x] private Dokument-/Medien-Buckets mit Storage-RLS
- [x] Dokument-Upload inkl. SHA-256 und Signed Download
- [x] private Medienbibliothek
- [x] Objekt-History, RLS und Optimistic Locking
- [x] sensible Rechte (Archiv, Zuständigkeit, Vermarktungsstart) in PostgreSQL erzwungen
- [x] aktueller Phase-2-UI-Stand in Cloudflare sichtbar
- [x] Browser-Smoke-Test Immobilienanlage und Objektakte
- [x] Browser-Smoke-Test Dokumentdownload, neue Version und Versionshistorie
- [x] Browser-Smoke-Test Medien-Metadaten und Uploadpfad
- [x] Modul-02-Abschlussprüfung gegen Definition of Done

### Phase 3 – Eigentümer & Leads — IN ARBEIT
- [ ] Verkäufer-Lead-Pipeline
- [ ] Leadquellen/Attribution
- [ ] Bewertungsformular
- [ ] Lead ↔ CRM-Kontakt
- [ ] Wiedervorlage / Verantwortlicher Benutzer
- [ ] Activity / Kommentare / @Mentions / Audit
- [ ] Optimistic Locking / Archivieren
- [ ] Lead → Immobilie Workflow
- [ ] Browser-Smoke-Test und DoD

### Phase 4 – Interessenten & Besichtigungen
- [ ] Anfragen
- [ ] Suchprofile
- [ ] Matching
- [ ] Besichtigungen
- [ ] Feedback
- [ ] Kaufangebote

### Phase 5 – Website & Exposés
- [ ] öffentliche Website
- [ ] Objektpublikation
- [ ] Exposé-Generator
- [ ] Versionierung/Freigabe

### Phase 6 – Dashboard & Provisionen
- [ ] persönliches Dashboard
- [ ] Unternehmensdashboard
- [ ] Provisionslogik
- [ ] interne Provisionszuordnung

### Phase 7+
- [ ] Portalexport/OpenImmo
- [ ] Eigentümerportal
- [ ] Dokumentengenerator
- [ ] Automatisierungen
