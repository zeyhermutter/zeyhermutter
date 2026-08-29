# ZeyherMutterOS – Product Backlog

Priorisierung: **MUST > SHOULD > COULD > LATER**.

## MUST – Aktuelles Fundament
- [x] Eigenes Repository / eigene Infrastruktur
- [x] Cloudflare STAGING über workers.dev
- [x] Supabase STAGING getrennt von SeasonCrew
- [x] Rollen und Permissions als Datenmodell
- [x] append-only Audit-History
- [x] Activity-History
- [x] RLS als Default
- [ ] alle ausgeführten DB-Migrationen im Repository spiegeln
- [ ] Auth-Flow für zwei getrennte Benutzerkonten
- [ ] Geschäftsführerrolle bootstrappen
- [ ] Server-/RLS-Test für unberechtigten Zugriff
- [ ] Session-/Logout-/Fehlerzustände

## MUST – CRM MVP
- [ ] Contact
- [ ] Organization
- [ ] ContactRole
- [ ] ContactRelationship
- [ ] ContactOrganizationRelationship
- [ ] Aufgaben
- [ ] Aktivitätsfeed
- [ ] Kommentare/@Mentions
- [ ] Archivieren/Wiederherstellen
- [ ] Duplikatwarnung
- [ ] Feldgenaue History
- [ ] Optimistic Locking
- [ ] globale Suche

## SHOULD – Zusammenarbeit
- [ ] Soft Presence
- [ ] Beobachten/Abonnieren
- [ ] Benachrichtigungspräferenzen
- [ ] gespeicherte Ansichten
- [ ] Teamaktivitäten

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
