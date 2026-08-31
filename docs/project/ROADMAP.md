# ZeyherMutterOS – Roadmap

## Ziel
ZeyherMutterOS wird als produktionsfähige, sichere und nachvollziehbare Plattform für den gemeinsamen Betrieb einer Immobilienmaklerfirma entwickelt.

## Arbeitsweise
- STAGING zuerst, Production nur nach ausdrücklicher Freigabe.
- ZeyherMutterOS verwendet eine eigenständige Projektinfrastruktur.
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

### Phase 3 – Eigentümer & Leads — DONE
- [x] Verkäufer-Lead-Datenmodell und automatische `ZM-L-######` Nummer
- [x] serverseitige Lead-Statusmaschine
- [x] Leadquellen/Attribution getrennt vom Status
- [x] Lead ↔ bestehender CRM-Kontakt; mehrere Leads pro Kontakt
- [x] Lead-Verzeichnis `/leads` mit Pipeline, Filtern, Suche und Pagination
- [x] Lead-Neuanlage `/leads/new`
- [x] zentrale Leadakte `/leads/:leadId`
- [x] Bewertungsworkflow inkl. Termin, Marktwert, Notiz und Angebotsdaten
- [x] Wiedervorlage / verantwortlicher Benutzer
- [x] Aufgaben mit Leadbezug und Rücklink
- [x] Activity / Kommentare / @Mentions / Notifications
- [x] feldgenaues Audit / Optimistic Locking / Archivieren
- [x] globale CRM-Suche findet Leads
- [x] CRM-Dashboard integriert Verkäufer-Leads
- [x] atomarer und idempotenter Lead → Immobilie Workflow
- [x] serverseitige Permission-, Conversion-, Integritäts- und Concurrency-Tests
- [x] aktueller Modul-03-UI-Stand erfolgreich auf Cloudflare sichtbar
- [x] vollständiger Browser-Smoke-Test Modul 03
- [x] Modul-03-Abschlussprüfung gegen Definition of Done

### Phase 4 – Interessenten & Besichtigungen — IN ARBEIT
- [x] Kern-Datenmodell für Anfragen
- [x] Kern-Datenmodell für mehrere Suchprofile je CRM-Kontakt
- [x] RLS/Permissions/Audit/Optimistic Concurrency für Suchprofile und Anfragen
- [x] Interessenten-/Suchprofil-Verzeichnis
- [x] Suchprofil-Neuanlage und -Bearbeitung
- [x] mehrere Suchorte je Profil verwalten
- [x] Suchradius mit serverseitiger Validierung und Pflicht-Suchort
- [x] PLZ-/Ort-/Radius-Matching inkl. Altbestand-Normalisierung
- [x] CRM-Dashboard/Navigationsintegration für Interessenten
- [x] Anfragen-Workflow
- [x] Matching Suchprofil → Immobilie mit nachvollziehbaren Gründen
- [x] Reverse Matching Immobilie → passende Interessenten über dieselbe Matching-Engine
- [x] Besichtigungen inkl. Kontextübernahme und Rückverknüpfungen
- [x] kontrollierte Korrektur einer versehentlich als durchgeführt markierten Besichtigung
- [x] Feedback
- [x] Kaufangebote mit `ZM-KA-######`, Folgeangeboten und nur einem aktuellen aktiven Angebot je Kontakt/Immobilie
- [x] globale Suche / Aufgaben / Activity / Collaboration technisch integriert
- [x] Aufgabenmodal und lesbare fachliche Bezüge für Suchprofile/Anfragen/Besichtigungen
- [x] technische Negativtests M04-17 / M04-45 / M04-46 / M04-47 / M04-48
- [x] Security-/Performance-Advisor nach Fixblock geprüft
- [ ] M04-49 Responsive Browser-Abnahme durch Nutzer
- [ ] M04-50 vollständiger End-to-End-Browser-Test durch Nutzer
- [ ] vollständiger Browser-Smoke-Test Modul 04
- [ ] Modul-04-Abschlussprüfung gegen Definition of Done

### Phase 5 – Website & Exposés — IN ARBEIT
- [x] getrennte Veröffentlichungsakte je Immobilie
- [x] unveränderliche Freigabe-/Publikationsversionen
- [x] öffentliche Daten als sicherer Snapshot statt Live-Zugriff auf interne Objektakte
- [x] RLS: Entwürfe intern, nur aktuelle veröffentlichte Version anonym lesbar
- [x] Freigaberechte über `property.publish` serverseitig erzwungen
- [x] öffentliche Immobilienliste `/immobilien`
- [x] öffentliche Immobilienseite `/immobilien/:slug`
- [x] interne Veröffentlichungsakte `/properties/:propertyId/publication`
- [x] kontrollierte Bildauslieferungs-Grundlage für `public_approved` Medien
- [x] Website-Anfrage-Intake in das bestehende Modul-04-Anfragemodell
- [x] Exposé-Datenmodell und PDF-Generator-Grundlage auf Basis einer Publikationsversion
- [ ] Exposé-UI/Route vollständig integrieren und browserseitig abnehmen
- [ ] Veröffentlichungs-/Exposé-Browser-Smoke-Test
- [ ] Modul-05-Abschlussprüfung gegen Definition of Done

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
