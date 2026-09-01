# ZeyherMutterOS – Product Backlog

Priorisierung: **MUST > SHOULD > COULD > LATER**.

## MUST – Fundament — DONE
- [x] Eigenes Repository / eigene Infrastruktur
- [x] Cloudflare STAGING über workers.dev
- [x] Eigenes Supabase STAGING
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
- [x] Aufgaben inkl. Benutzerzuweisung/Wiedervorlagen
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

## MUST – Immobilien MVP — DONE
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
- [x] Cloudflare-Stand im Browser bestätigt
- [x] Browser-Smoke-Test Immobilie anlegen/bearbeiten/status
- [x] Browser-Smoke-Test Dokumentdownload + Versionsworkflow
- [x] Browser-Smoke-Test Medien und Metadaten
- [x] Modul-02-DoD abgeschlossen

## MUST – Eigentümer & Leads MVP — DONE
- [x] Lead mit eigener Nummer und Statusmaschine
- [x] Verkäufer-Lead-Status NEW / CONTACTED / QUALIFIED / APPOINTMENT / VALUATION / OFFER / WON / LOST / NURTURE
- [x] Leadquelle separat von Status speichern
- [x] Verlustgrund bei LOST erzwingen
- [x] Lead mit bestehendem CRM-Kontakt verknüpfen; kein paralleles Kontaktsystem
- [x] mehrere Leads pro Kontakt zulassen
- [x] Objekt-/Bewertungsanfrage inkl. Adresse, Typ, Baujahr, Flächen, Zimmer, Zustand, Belegung, Verkaufshorizont, Preisvorstellung, Nachricht, Quelle und Consent
- [x] Bewertungstermin, Marktwert, Bewertungsnotiz, Angebotszeitpunkt und Konditionen
- [x] verantwortlicher Benutzer + Wiedervorlage
- [x] Lead-Verzeichnis, Pipeline, Filter und Lead-Neuanlage
- [x] zentrale Leadakte
- [x] Activity / Kommentare / @Mentions / Notifications wiederverwenden
- [x] Aufgaben können an Leads hängen und verlinken zurück
- [x] globale Suche findet Leads
- [x] Verkäufer-Leads im CRM-Dashboard
- [x] Audit, RLS, Permissions und Optimistic Locking
- [x] Archivieren/Wiederherstellen statt löschen
- [x] atomarer und idempotenter Lead → Immobilie Workflow ohne Doppelanlage
- [x] Kontakt als Eigentümer sowie Objektadresse/-daten bei Konvertierung übernehmen
- [x] serverseitige Permission-, Conversion-, Integritäts- und Concurrency-Tests
- [x] aktueller Modul-03-UI-Stand auf Cloudflare sichtbar bestätigt
- [x] Browser-Smoke-Test Leadanlage, Bearbeitung, Pipeline, Aufgaben, Collaboration, Archiv, Suche und Konvertierung
- [x] Modul-03-DoD abgeschlossen

## MUST – Interessenten & Suchprofile MVP — IN ARBEIT
- [x] Interessent bleibt bestehender CRM-Kontakt; kein paralleles Personenmodell
- [x] mehrere Suchprofile je Kontakt
- [x] Suchprofilnummer `ZM-S-######`
- [x] Anfragen mit Nummer `ZM-A-######`
- [x] Kauf-/Miet-Suchprofile mit Preis, Fläche, Zimmern, Grundstück, Baujahr, Einzug und Finanzierung
- [x] mehrere Suchorte je Suchprofil inkl. PLZ/Ort/Ortsteil/Radius
- [x] Pflicht-Suchort und serverseitig validierter Suchradius
- [x] RLS, Audit, Archivieren und Optimistic Concurrency für Suchprofile/Anfragen
- [x] Aufgaben können an Anfrage, Suchprofil und Besichtigung hängen
- [x] Suchprofil-Verzeichnis und Filter
- [x] Suchprofil-Neuanlage und Detailakte
- [x] mehrere Suchorte in der Suchprofilakte verwalten
- [x] CRM-Navigation/Dashboard für Interessenten
- [x] Anfrage-Verzeichnis und Anfrageakte
- [x] globale Suche findet Suchprofile und Anfragen
- [x] Activity / Kommentare / @Mentions / Notifications integriert
- [x] regelbasiertes Immobilien-Matching
- [x] PLZ-/Ort-/Radius-Matching mit nachvollziehbaren Match-Gründen
- [x] Reverse Matching in der Immobilienakte über dieselbe Matching-Engine
- [x] Matchentscheidungen wie Interessant / Gesendet / Abgelehnt / Besichtigung gewünscht
- [x] Besichtigungsworkflow inkl. Kontextübernahme und Rücklinks
- [x] kontrollierter Korrekturpfad für versehentlich „Durchgeführt“
- [x] Feedback
- [x] Kaufangebote mit `ZM-KA-######`
- [x] Folgeangebote ersetzen den vorherigen aktiven Preisstand ohne Historienverlust
- [x] pro Kontakt + Immobilie maximal ein aktives abgegebenes Angebot
- [x] Aufgabenmodal und deutsche Status-/Prioritätsbezeichnungen
- [x] negative Permission-/RLS-/API-Bypass-Tests M04-17 / 45 / 46 / 47 / 48
- [x] Advisor-Prüfung nach dem Browser-Fixblock
- [x] Anfrage → Suchprofil atomar anlegen und rückverknüpfen
- [ ] M04-49 Responsive Browser-Abnahme
- [ ] M04-50 vollständiger End-to-End-Browser-Test
- [ ] Browser-Smoke-Test Modul 04 final abschließen
- [ ] Modul-04-DoD abschließen

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
- [ ] fachlich entscheiden und erzwingen, ob Website-/Exposé-Freigaben zwingend durch eine andere Person erfolgen müssen
- [ ] konfigurierbare Dashboards
- [ ] erweiterte Suchfilter

## P2 – Senior-Review-Folgearbeiten
- [ ] gemeinsame, wiederverwendbare Adress-Schnelleingabe statt DOM-Enhancer und duplizierter Geocoding-Logik
- [x] CRM-Dashboard-Aggregate in eine begrenzte serverseitige Abfrage/RPC zusammenfassen
- [ ] große Verzeichnisse auf serverseitige Keyset-Pagination umstellen; keine festen 500/1000-Zeilen-Limits mit Clientfilterung
- [ ] Cloudflare-Worker-Integrationstests mit realistischem Runtime-Testpool ergänzen
- [ ] verbleibende explizite `any`-Typen abbauen und stark komprimierte Routen in testbare Komponenten zerlegen
- [ ] strukturierte SEO-Daten, konsistente Canonicals sowie 404/410-Regeln vervollständigen
- [ ] Supabase Auth „Leaked Password Protection“ in der Projektkonsole aktivieren
- [ ] dediziertes PROD-Projekt samt Backup-/Restore-Probe und Custom-Domain einrichten

## LATER
- [ ] Portalexport
- [ ] Eigentümerportal
- [ ] Dokumentengenerator
- [ ] Automations-Engine
- [ ] Microsoft-365-Integration
- [ ] Buchhaltungsintegration

## Backlog-Regel
Ein Item wird erst als erledigt markiert, wenn die Definition of Done erfüllt ist. Neue Wünsche werden zuerst priorisiert und nicht ungeprüft in laufende Inkremente gezogen.