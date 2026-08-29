# ZeyherMutterOS – Product Backlog

Priorisierung: **MUST > SHOULD > COULD > LATER**.

## MUST – Fundament — DONE
- [x] Eigenes Repository / eigene Infrastruktur
- [x] Cloudflare STAGING über workers.dev
- [x] Supabase STAGING getrennt von SeasonCrew
- [x] Rollen und Permissions als Datenmodell
- [x] append-only Audit-History
- [x] Activity-History
- [x] RLS als Default
- [x] alle ausgeführten DB-Migrationen im Repository spiegeln
- [x] Auth-Flow für zwei getrennte Benutzerkonten
- [x] Geschäftsführerrolle bootstrappen
- [x] Server-/RLS-Test für unberechtigten Zugriff
- [x] Session-/Logout-/Fehlerzustände

## MUST – CRM MVP — DONE
- [x] Contact
- [x] strukturierte ContactAddress
- [x] Organization
- [x] ContactRole
- [x] ContactRelationship
- [x] ContactOrganizationRelationship
- [x] Aufgaben inkl. Benutzerzuweisung/Wiedervorlage
- [x] Aktivitätsfeed
- [x] Kommentare/@Mentions
- [x] Benachrichtigungs-Inbox für Mentions
- [x] Archivieren/Wiederherstellen mit separaten Permissions
- [x] Duplikatwarnung: E-Mail / Mobil / Name + Anschrift
- [x] feldgenaue History
- [x] Optimistic Locking
- [x] globale Suche
- [x] atomare Kontaktanlage inkl. optionaler Primäradresse
- [x] globale Systemhistorie
- [x] aktueller CRM-UI-Stand in Cloudflare sichtbar
- [x] Browser-Smoke-Test der CRM-Bereiche
- [x] echter zweiter Browser-Login
- [x] Zwei-Benutzer-Test Zuweisung + @Mention + Notification

## MUST – Immobilien MVP — IN ARBEIT
- [x] Property mit `ZM-YYYY-####`
- [x] PropertyAddress intern/öffentlich getrennt
- [x] Objektstatusmaschine mit erlaubten Übergängen
- [x] property.read / write / publish / assign / archive serverseitig durchsetzbar
- [x] PropertyOwner inkl. Mehrfacheigentum und Prozentprüfung
- [x] PropertyFeature flexibel
- [x] PropertyEnergyData
- [x] automatische Vermarktungscheckliste
- [x] Objekt-History und Concurrent Editing
- [x] globale Suche findet Immobilien
- [x] Aufgaben können an Immobilien hängen
- [x] Document + append-only DocumentVersion
- [x] SHA-256 / MIME / Dateigröße / Originalname / Änderungsgrund
- [x] private Supabase Storage Buckets mit RLS
- [x] private Medienbibliothek
- [x] UI Objektliste / Neuanlage / Objektakte
- [x] UI Eigentümer / Ausstattung / Energie / Checkliste
- [x] UI Dokumente / Versionen / Signed Download
- [x] UI Medien
- [ ] Cloudflare-Build des aktuellen Immobilienstands bestätigen
- [ ] Browser-Smoke-Test Immobilie anlegen und bearbeiten
- [ ] Browser-Smoke-Test Dokumentupload + neue Version + Download
- [ ] Browser-Smoke-Test Medienupload
- [ ] Modul-02-DoD abschließen

## SHOULD – Zusammenarbeit
- [ ] Soft Presence
- [ ] Beobachten/Abonnieren
- [ ] Benachrichtigungspräferenzen
- [ ] gespeicherte Ansichten
- [ ] Teamaktivitäten/Unternehmensfeed

## SHOULD – Compliance
- [ ] ComplianceRecord
- [ ] Einwilligungen
- [ ] Aufbewahrungsregeln
- [ ] Legal Hold
- [ ] KYC/GwG-Datenmodell

## COULD
- [ ] Approval-/Vier-Augen-Workflow
- [ ] konfigurierbare Dashboards
- [ ] erweiterte Suchfilter

## LATER
- [ ] Portalexport
- [ ] Eigentümerportal
- [ ] Dokumentengenerator
- [ ] Automations-Engine
- [ ] Microsoft-365-Integration
- [ ] Buchhaltungsintegration

## Backlog-Regel
Ein Item wird erst als erledigt markiert, wenn die Definition of Done erfüllt ist. Neue Wünsche werden zuerst priorisiert und nicht ungeprüft in laufende Inkremente gezogen.
