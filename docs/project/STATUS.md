# ZeyherMutterOS – Projektstatus

Stand: 29.08.2026

## Aktuelles Ziel
Phase 2 / Modul 02 Immobilien – STAGING-Implementierung und Abschluss gegen Definition of Done.

## Infrastruktur
- separates GitHub-Repository `zeyhermutter/zeyhermutter`
- separates Supabase-STAGING in Frankfurt
- Cloudflare-STAGING über `zeyhermutter.playsony.workers.dev`
- SeasonCrew vollständig isoliert
- Production nicht angelegt / nicht verändert

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
- beide Geschäftsführer können sich im Browser anmelden
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
- echter Zwei-Benutzer-Test: Aufgabe zugewiesen, Mention erzeugt, Notification für Benutzer 2 sichtbar
- direkter RLS-/Permission-Zugriff getestet

## Modul 02 · Immobilien – implementierter STAGING-Stand
### Objektkern
- automatische Nummer `ZM-YYYY-####`
- Immobilientypen und SALE/RENT
- Preise als PostgreSQL `numeric`
- Flächen, Zimmer, Baujahr, Zustand, Verfügbarkeit, Vermietungsstatus, Stellplätze, Einheiten
- primär verantwortlicher Benutzer
- interne Notizen
- Optimistic Locking

### Statusmaschine
- DRAFT
- ACQUISITION
- VALUATION
- CONTRACT_PENDING
- PREPARATION
- MARKETING
- RESERVED
- NOTARY
- SOLD
- LOST
- WITHDRAWN
- ARCHIVED
- nur definierte Übergänge
- ungültiger direkter Übergang DRAFT → SOLD im DB-Test erfolgreich blockiert
- Archivierung merkt vorherigen Status und Restore darf nur dorthin zurück
- Vermarktungsstart benötigt `property.publish`
- Archiv/Restore benötigt `property.archive`
- Zuständigkeitswechsel benötigt `property.assign`

### Adresse
- vollständige interne Objektadresse
- öffentliche Darstellung separat steuerbar: FULL / STREET_ONLY / DISTRICT_ONLY / CITY_ONLY / HIDDEN
- Objekt + optionale vollständige Adresse werden atomar angelegt

### Eigentümer
- mehrere Eigentümer pro Objekt
- Prozentanteile
- Eigentumsart
- Hauptkontakt
- Gültigkeitszeitraum
- aktive Prozentanteile > 100 % werden von PostgreSQL blockiert

### Ausstattung & Energie
- flexibles PropertyFeature-Modell
- Standardmerkmale wie Balkon, Terrasse, Garten, Aufzug, PV, Wärmepumpe usw.
- Energieausweis vorhanden/nicht vorhanden
- Art, Kennwert, Effizienzklasse, Energieträger, Gebäudebaujahr, Gültigkeit
- keine künstlichen Ersatzwerte

### Vermarktungscheckliste
- 10 Standardpunkte werden beim Objekt automatisch angelegt
- Pflicht/optional
- TODO / IN_PROGRESS / DONE / WAIVED
- Abschlussbenutzer und Zeitstempel
- initiales Seeding erzeugt bewusst keine Audit-Spam-Ereignisse

### Dokumente
- Document + append-only DocumentVersion
- Kategorien gemäß Maklerworkflow
- PUBLIC / INTERNAL / CONFIDENTIAL
- private Storage-Bucket `zm-private-documents`
- Storage-RLS
- Upload-MIME- und Größenbeschränkung
- SHA-256
- Originaldateiname
- Dateigröße
- MIME-Type
- Änderungsgrund
- automatische fortlaufende Dokumentversion
- zeitlich begrenzte Signed Downloads
- keine Datei wird per Upsert überschrieben
- Dokumentarchivierung benötigt `document.archive`

### Medien
- privater Bucket `zm-property-media`
- Fotos, Grundrisse, MP4 und sonstige freigegebene Medien
- Sortierung
- Alt-Text
- Kennzeichen für spätere Veröffentlichungsfreigabe
- noch keine öffentliche Bucket-Freigabe

### Integration
- Immobilien im CRM-Dashboard verlinkt
- globale Suche findet Property-Nummer, Titel und Adresse
- Aufgaben können einen `property_id`-Bezug haben
- Objektänderungen im zentralen AuditLog
- Kinddaten wie Adresse/Eigentümer/Ausstattung/Energie/Checkliste werden dem PROPERTY-Audit zugeordnet

## UI im Repository
- `/properties` Objektverzeichnis mit Filtern/Pagination
- `/properties/new` atomare Neuanlage
- `/properties/:propertyId` Objektakte
- `/properties/:propertyId/documents` private Dokumentverwaltung
- `/properties/:propertyId/media` Medienbibliothek
- Objektakte: Status, Stammdaten, Adresse, Eigentümer, Ausstattung, Energie, Checkliste, History
- Dokumente und Medien direkt aus Objektverzeichnis erreichbar
- responsive Layouts für Desktop/Tablet/Mobil

## Verifizierte technische Tests Modul 02
- Nummerngenerierung serverseitig und ohne Client-Zugriff auf privaten Zähler
- Checklisten-Seeding = 10 Punkte
- valide Statuswechsel DRAFT → ACQUISITION → VALUATION
- ungültiger Statuswechsel DRAFT → SOLD blockiert
- Eigentümer-/Adressanlage unter echter Geschäftsführer-RLS
- Dokumentversion setzt `current_version=1` und `version_number=1`
- Property-Suche über Titel/Adresse liefert PROPERTY-Treffer
- Makler-Rolle ohne Archiv-/Publish-Permission: Contact Archive BLOCKED, Document Archive BLOCKED, Property Archive BLOCKED, Property Publish BLOCKED
- alle technischen Testdaten per Rollback entfernt
- Security Advisor: nur `Leaked Password Protection Disabled` auf Free-STAGING
- Performance Advisor: keine fehlenden FK-Indizes; nur erwartbare `unused index`-Infos im frischen STAGING

## Noch offen für Modul 02 DONE
1. Cloudflare muss den aktuellen `main`-Stand erfolgreich bauen/deployen.
2. Browser-Smoke-Test Objekt anlegen/bearbeiten/Status wechseln.
3. Browser-Smoke-Test Dokument hochladen → neue Version → Signed Download.
4. Browser-Smoke-Test Medienupload.
5. Danach DoD-Abgleich und Modul 02 schließen.

## Production
Nicht angelegt / nicht verändert. Production bleibt bis zur ausdrücklichen Freigabe gesperrt.
