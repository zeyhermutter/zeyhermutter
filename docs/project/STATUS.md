# ZeyherMutterOS – Projektstatus

Stand: 29.08.2026

## Aktuelles Ziel
Phase 1 / Modul 01 CRM – Abschluss gegen Definition of Done.

## Infrastruktur
- separates GitHub-Repository `zeyhermutter/zeyhermutter`
- separates Supabase-STAGING in Frankfurt
- Cloudflare-STAGING über `zeyhermutter.playsony.workers.dev`
- SeasonCrew vollständig isoliert
- Production nicht angelegt / nicht verändert

## Auth & Security
- Supabase Auth + SSR-Cookies
- geschützte CRM-Routen mit `getClaims()`
- erster echter Benutzer ACTIVE
- Rolle `managing_director` zugewiesen
- serverseitige Rollen/Permissions
- RLS auf fachlichen Tabellen
- RLS unter echtem `authenticated` Geschäftsführer-Kontext getestet
- expliziter serverseitiger Permission-Guard für sensible Routen
- sichere `current_user_has_permission()`-RPC läuft als SECURITY INVOKER
- Systemhistorie benötigt explizit `audit.read`
- keine `service_role`-Credentials im Client
- private Security-Helper nicht über Data API exponiert
- öffentliche RPCs für Suche/Duplikate/Kontaktanlegen laufen als SECURITY INVOKER
- Mention-Notifications werden über privaten Trigger erzeugt; öffentliche Kommentar-RPC bleibt im RLS-Kontext
- Security Advisor: nur `Leaked Password Protection Disabled` verbleibt; auf Free-STAGING akzeptiert, vor Production erneut prüfen
- Performance Advisor: FK-Index- und RLS-InitPlan-Warnungen behoben; verbleibende `unused index`-Infos sind bei leerem/neuem STAGING erwartbar

## CRM – implementiert
### Kontakte
- Kontaktanlage und Stammdatenbearbeitung
- strukturierte optionale Primäradresse
- atomare Kontakt + Adresse Anlage
- automatische Geschäftsnummer `ZM-K-...`
- Rollen
- Personenbeziehungen
- Kontakt ↔ Organisation Beziehungen mit Rolle/Funktion
- mehrere Adressen
- Arbeitsbereich und getrennte Stammdaten/Verknüpfungen

### Organisationen
- Verzeichnis
- Neuanlage
- Detail/Bearbeitung
- History
- Optimistic Locking

### Aufgaben
- globale Aufgaben-/Wiedervorlagenverwaltung
- Priorität, Beschreibung, Fälligkeit und Kontaktbezug
- Verantwortlicher Benutzer
- spätere Umzuweisung an andere aktive Benutzer
- OPEN / IN_PROGRESS / DONE / CANCELLED
- Überfällig-Erkennung
- Archivierung erledigter/abgebrochener Aufgaben
- Optimistic Locking

### Zusammenarbeit
- Activity History pro Kontakt
- Notiz / Telefonat / E-Mail / Meeting
- interne Kommentare
- @Mentions
- Benachrichtigungs-Inbox
- einzelne/alle Benachrichtigungen als gelesen markieren
- zweiter aktiver Benutzer erscheint automatisch in Zuweisung und Mention-Auswahl

### Suche & Duplikate
- globale Suche über Kontakte, Kontaktnummern, Vollnamen, E-Mail, Telefon/Mobil, Anschriften, Organisationen und Aufgaben
- Archiv kann optional in Suche einbezogen werden
- regelbasierte Duplikaterkennung: gleiche E-Mail, gleiche normalisierte Mobilnummer oder gleicher Name + vollständige Anschrift
- niemals automatischer Merge
- vorhandenen Datensatz öffnen oder bewusst trotzdem neu anlegen

### Archiv
- zentrale Archivverwaltung für Kontakte, Organisationen und Aufgaben
- getrennte Archive-Permissions
- `archived_by` serverseitig gesetzt
- Wiederherstellung löscht `archived_by`
- Audit-Aktionen `ARCHIVE` und `RESTORE`
- Versionierung/Concurrency auch bei Archivaktionen

### History
- append-only AuditLog
- CREATE / UPDATE / STATUS_CHANGE / ARCHIVE / RESTORE / DELETE
- alter/neuer Wert für Stammdaten
- Rollen-/Personen-/Firmenbeziehungen dem Kontakt-Audit zugeordnet
- Adressänderungen dem Kontakt-Audit zugeordnet
- fachliche Activity getrennt vom Audit
- globale Systemhistorie `/crm/history`
- Filter nach Entity, Aktion, Benutzer und Geschäftsreferenz
- Pagination mit 50 Ereignissen pro Seite
- Zugriff zusätzlich zu RLS explizit über `audit.read` geschützt

## Verifizierte Tests
- echter Browser-Login erfolgreich
- echter Kontakt im Browser erfolgreich angelegt und CREATE-Audit verifiziert
- Kontakt Create → Audit → Update → Version 2 → stale Update blockiert
- Rollen/Beziehungen/Aufgaben unter echter RLS erfolgreich
- Audit für Rolle + Beziehung + Aufgabe erfolgreich
- Kontakt+Adresse atomar erstellt
- Duplikaterkennung liefert erwarteten Treffer
- Vollnamensuche und kombinierte PLZ/Ort-Suche erfolgreich
- Archiv: `archived_by` = ausführender Benutzer, Version 2, genau ein ARCHIVE-Event
- Restore: `archived_by` leer, Version 3, RESTORE-Event
- Collaboration: Aktivität + Kommentar + zugewiesene Aufgabe erfolgreich; Selbst-Mention erzeugt bewusst keine Notification
- Permission-Test: `audit.read = true`, nicht vorhandene Permission = false, `permission.manage` für Geschäftsführer = false
- alle technischen Smoke-Test-Daten jeweils per Rollback entfernt

## Noch offene Akzeptanzpunkte vor „Modul 01 DONE“
1. aktueller kompletter UI-Stand muss erfolgreich von Cloudflare aus `main` gebaut/deployed sein
2. Browser-Smoke-Test der neuen Bereiche: Suche, Aufgaben, Organisationen, Archiv, Firma & Adresse, Aktivität & Team, Inbox, Systemhistorie
3. echter Zwei-Benutzer-Akzeptanztest für Aufgabe zuweisen + @Mention + Notification; dafür wird ein zweites reales Benutzerkonto benötigt

## Danach
Nach erfolgreicher Modul-01-Abnahme beginnt Phase 2 / Modul 02 Immobilien. Gemeinsame Grundlagen dürfen weiter gehärtet werden, aber keine Production-Änderungen ohne ausdrückliche Freigabe.

## Production
Nicht angelegt / nicht verändert. Production bleibt bis zur ausdrücklichen Freigabe gesperrt.
