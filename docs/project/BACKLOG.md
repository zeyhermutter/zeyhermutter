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
- [x] alle ausgeführten DB-Migrationen im Repository spiegeln
- [ ] Auth-Flow für zwei getrennte Benutzerkonten – technisch vorbereitet; echter zweiter Browser-Login noch nicht angelegt/getestet
- [x] Geschäftsführerrolle bootstrappen
- [x] Server-/RLS-Test für unberechtigten Zugriff
- [x] Session-/Logout-/Fehlerzustände

## MUST – CRM MVP
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
- [x] Archivieren/Wiederherstellen mit separater Permission
- [x] Duplikatwarnung: E-Mail / Mobil / Name + Anschrift
- [x] feldgenaue History
- [x] Optimistic Locking
- [x] globale Suche inkl. Kontakte, Anschriften, Organisationen und Aufgaben
- [x] atomare Kontaktanlage inkl. optionaler Primäradresse

## MUST – Abschluss-Akzeptanz Modul 01
- [x] RLS-/Permission-Smoke-Tests unter realem `authenticated` Geschäftsführer-Kontext
- [x] Audit-/Concurrency-/Archiv-/Suche-/Collaboration-Smoke-Tests mit Rollback
- [x] Security Advisor nach DDL-Änderungen geprüft
- [x] Performance-Advisor: FK-Index- und RLS-InitPlan-Warnungen behoben
- [ ] aktueller kompletter UI-Stand erfolgreich durch Cloudflare gebaut
- [ ] Browser-Smoke-Test der neuen CRM-Bereiche: Suche, Aufgaben, Organisationen, Archiv, Firma & Adresse, Aktivität & Team
- [ ] echter Zwei-Benutzer-Akzeptanztest für Zuweisung + @Mention + Notification

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
