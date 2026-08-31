# ZeyherMutterOS – Projektstatus

Stand: 31.08.2026

## Aktuelles Ziel
Phase 4 / Modul 04 Interessenten & Besichtigungen – zunächst Interessenten, Suchprofile und Anfragen als belastbares Fundament für Matching und spätere Besichtigungen.

## Infrastruktur
- separates GitHub-Repository `zeyhermutter/zeyhermutter`
- separates Supabase-STAGING in Frankfurt
- Cloudflare-STAGING über `zeyhermutter.playsony.workers.dev`
- eigenständige ZeyherMutterOS-Infrastruktur
- Production nicht verändert

## Phase 0 – DONE
Architektur, Cloudflare, Supabase, Rollen/Permissions, Audit/Activity, RLS, Optimistic Concurrency und migrationsbasierte Entwicklung sind etabliert.

## Modul 01 · CRM – DONE
Kontakte, Organisationen, Beziehungen, Aufgaben, Activity, Kommentare/@Mentions, Benachrichtigungen, Suche, Archiv, History und Zwei-Benutzer-Akzeptanztest sind abgeschlossen.

## Modul 02 · Immobilien – DONE
Objektstammdaten, Statusmaschine, Eigentümer, Ausstattung, Energie, Checkliste, private Dokumente/Medien, Aufgaben, Suche, Audit/RLS und Browser-Smoke-Test sind abgeschlossen.

## Modul 03 · Eigentümer & Leads – DONE
- vollständige Verkäufer-Lead-Pipeline und Leadakte
- Bewertungsworkflow und Wiedervorlagen
- Aufgaben, Activity, Kommentare, @Mentions und Benachrichtigungen
- globale Suche und CRM-Dashboard
- atomare/idempotente Lead→Immobilie-Konvertierung
- Pflichtfeld-/Freigabelogik vor Objektanlage
- fachliche Sperre nach Konvertierung
- Browser-Smoke-Test und finale Abnahme erfolgreich
- Definition of Done erfüllt

## Modul 04 · Interessenten & Besichtigungen – IN ARBEIT

### Architekturentscheidung
Ein Interessent ist kein neues Personenobjekt. Er bleibt ein bestehender CRM-Kontakt. Suchkriterien und einzelne Anfragen werden als eigene fachliche Vorgänge daran gehängt.

### Bereits umgesetzt
- `search_profiles` mit automatischer Nummer `ZM-S-######`
- mehrere Suchprofile je CRM-Kontakt
- Status ACTIVE / PAUSED / CLOSED
- BUY / RENT
- Immobilientypen als Mehrfachauswahl
- Preisbereich als PostgreSQL `numeric`
- Wohnflächenbereich, Mindestgrundstück, Mindestzimmer, Mindestbaujahr
- gewünschter Einzug
- Finanzierungsstatus
- gewünschte Merkmale
- mehrere Suchorte über `search_profile_locations`
- Ort / PLZ / Ortsteil / Radius
- `inquiries` mit automatischer Nummer `ZM-A-######`
- Anfragen können Kontakt, Immobilie und Suchprofil referenzieren
- Anfragekanal und Bearbeitungsstatus
- Verantwortlicher Benutzer
- RLS und granulare Suchprofil-Permissions
- Archiv-Permissions für Suchprofile und Anfragen
- Audit-History und Optimistic Concurrency
- Aufgaben besitzen technisch `inquiry_id` und `search_profile_id`
- Migration `20260831091447_module04_inquiries_search_profiles_core.sql` ist in STAGING und Repository vorhanden

### Nächste Schritte Modul 04
1. Suchprofil-Verzeichnis und Neuanlage
2. zentrale Suchprofilakte inkl. mehreren Suchorten
3. Anfrage-Verzeichnis und Anfrageakte
4. globale Suche / Aufgaben / Collaboration integrieren
5. regelbasiertes Matching gegen Immobilien
6. Besichtigungen, Feedback und Kaufangebote
7. Browser-Smoke-Test und DoD

## Offener externer Security-Punkt
Supabase Auth meldet weiterhin `Leaked Password Protection Disabled`. Diese Projekt-Auth-Einstellung ist kein Datenmodell-/Modulfehler und muss separat in der Supabase-Projektkonfiguration aktiviert werden, sobald gewünscht/verfügbar.

## Production
Production wurde nicht verändert und bleibt bis zur ausdrücklichen Freigabe gesperrt.
