# ZeyherMutterOS – Projektstatus

Stand: 31.08.2026

## Aktuelles Ziel
Phase 3 / Modul 03 Eigentümer & Leads – Verkäufer-Lead-Pipeline und kontrollierter Lead→Immobilie-Workflow auf STAGING.

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

## Modul 02 · Immobilien – DONE

### Objektkern
- automatische Nummer `ZM-YYYY-####`
- Immobilientypen und SALE/RENT
- Preise als PostgreSQL `numeric`
- Flächen, Zimmer, Baujahr, Zustand, Verfügbarkeit, Vermietungsstatus, Stellplätze, Einheiten
- primär verantwortlicher Benutzer
- interne Notizen
- Optimistic Locking

### Statusmaschine
- DRAFT / ACQUISITION / VALUATION / CONTRACT_PENDING / PREPARATION / MARKETING / RESERVED / NOTARY / SOLD / LOST / WITHDRAWN / ARCHIVED
- nur definierte Übergänge
- DRAFT → SOLD serverseitig blockiert
- Archivierung merkt vorherigen Status und Restore darf nur dorthin zurück
- Vermarktungsstart benötigt `property.publish`
- Archiv/Restore benötigt `property.archive`
- Zuständigkeitswechsel benötigt `property.assign`

### Adresse / Eigentümer / Ausstattung / Energie
- interne Objektadresse und separate öffentliche Adressdarstellung
- atomare Objektanlage mit optionaler Adresse
- mehrere Eigentümer; aktive Anteile >100 % serverseitig blockiert
- flexibles PropertyFeature-Modell
- strukturierte Energiedaten ohne Ersatzwerte

### Vermarktungscheckliste
- 10 automatisch angelegte Standardpunkte
- TODO / IN_PROGRESS / DONE / WAIVED
- `completed_by` und `completed_at` serverseitig verwaltet
- kein Audit-Spam beim initialen Seeding

### Dokumente
- Document + append-only DocumentVersion
- private Storage-Bucket `zm-private-documents`
- Storage-RLS
- SHA-256, MIME-Type, Dateigröße, Originaldateiname, Änderungsgrund
- automatische Versionsnummern
- Signed Preview und echter Signed Download
- neue Datei = neue Version; keine Überschreibung
- CONFIDENTIAL zusätzlich über `document.confidential.read` geschützt

### Medien
- privater Bucket `zm-property-media`
- Fotos, Grundrisse, Videos und sonstige freigegebene Typen
- Sortierung, Titel, Alt-Text, Freigabemarkierung
- Metadatenbearbeitung mit Optimistic Locking
- Bucket bleibt privat

### Integration
- globale Suche über Objektnummer, Titel und Adresse
- Aufgaben mit `property_id`
- Objekt- und Child-Audit mit altem/neuem Wert
- responsive UI für Objektliste, Neuanlage, Objektakte, Dokumente und Medien

### Abnahme Modul 02
- vollständiger serverseitiger Rollback-Test: PASS
- sensible Permission-Bypass-Tests: PASS
- Storage-/Dokument-/Medienintegrität: PASS
- Security Advisor: nur `Leaked Password Protection Disabled` als externe Auth-Konfiguration
- Performance Advisor: nur erwartbare `unused index`-Infos im jungen STAGING
- Browser: Anwendung/Deployment sichtbar
- Browser-Smoke-Test Objekt bearbeiten: PASS
- Browser-Smoke-Test Status: PASS
- Browser-Smoke-Test Signed Download + Dokumentversion: PASS
- Browser-Smoke-Test Medien-Metadaten: PASS
- Modul 02 Definition of Done: erfüllt

## Modul 03 · Eigentümer & Leads – IN ARBEIT
Zielbild:
- Verkäufer-Lead-Pipeline: NEW / CONTACTED / QUALIFIED / APPOINTMENT / VALUATION / OFFER / WON / LOST / NURTURE
- Leadquelle getrennt vom Leadstatus
- Leads verknüpfen vorhandene CRM-Kontakte; kein zweites Kontaktsystem
- mehrere Leads je Kontakt möglich
- Bewertungs-/Eigentümeranfrage mit Objektangaben und Consent
- Verlustgrund, Wiedervorlage und verantwortlicher Benutzer
- Activity / Kommentare / @Mentions aus dem bestehenden CRM wiederverwenden
- Audit, Optimistic Locking, Archivieren statt Löschen
- atomarer Lead → Immobilie Workflow

## Offener externer Security-Punkt
Supabase Auth meldet weiterhin `Leaked Password Protection Disabled`. Diese Projekt-Auth-Einstellung ist kein Datenmodell-/Modulfehler und muss separat in der Supabase-Projektkonfiguration aktiviert werden, sobald gewünscht/verfügbar.

## Production
Nicht angelegt / nicht verändert. Production bleibt bis zur ausdrücklichen Freigabe gesperrt.
