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

### Phase 0 – Architektur & Infrastruktur — IN ARBEIT
- [x] separates GitHub-Repository
- [x] separates Supabase-STAGING in Frankfurt
- [x] Cloudflare Worker + workers.dev Deployment
- [x] Rollen-/Permission-Grundmodell
- [x] Audit-/Activity-Grundmodell
- [x] RLS-Basis
- [x] Optimistic-Concurrency-Grundsatz
- [ ] reproduzierbare Migrationen vollständig im Repository
- [ ] Auth-Flow für zwei Geschäftsführer
- [ ] Security-/RLS-Basistests
- [ ] Architektur-Dokumentation vervollständigen

### Phase 1 – CRM — NÄCHSTES INKREMENT
- [ ] Kontakte
- [ ] Organisationen
- [ ] Kontaktrollen
- [ ] Kontaktbeziehungen
- [ ] Aktivitäten
- [ ] Aufgaben/Wiedervorlagen
- [ ] Kommentare/@Mentions
- [ ] Duplikaterkennung
- [ ] History pro Datensatz
- [ ] Concurrent Editing

### Phase 2 – Immobilien
- [ ] Objektstammdaten
- [ ] Eigentümerrelationen
- [ ] Ausstattung
- [ ] Energiedaten
- [ ] Dokumente/Versionen
- [ ] Objektstatusmaschine
- [ ] Vermarktungscheckliste

### Phase 3 – Eigentümer & Leads
- [ ] Verkäufer-Lead-Pipeline
- [ ] Leadquellen/Attribution
- [ ] Bewertungsformular
- [ ] Lead → Immobilie Workflow

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
