# ZeyherMutterOS – Architecture Decision Record (ADR Log)

Dieses Dokument hält verbindliche Architekturentscheidungen mit Begründung fest.

## ADR-001 – Modularer Monolith
**Status:** Accepted

ZeyherMutterOS startet als modularer Monolith. Microservices, Kubernetes und Event Sourcing werden nicht verwendet, solange kein realer Bedarf besteht.

**Warum:** geringere Komplexität, niedrigere Kosten, einfachere Transaktionen und schnellere Entwicklung bei zunächst zwei Benutzern.

## ADR-002 – Cloudflare Workers als Web-Runtime
**Status:** Accepted

React-basierte Webanwendung auf Cloudflare Workers/Static Assets. STAGING zunächst über `workers.dev`, spätere Custom Domain ohne Neubau.

## ADR-003 – Supabase als Datenplattform
**Status:** Accepted

Supabase PostgreSQL, Auth, Storage und Realtime. ZeyherMutterOS verwendet ein eigenes STAGING-Projekt und eigenständige Ressourcen.

## ADR-004 – PostgreSQL/RLS als Sicherheitsgrenze
**Status:** Accepted

Berechtigungen werden serverseitig und über Row Level Security durchgesetzt. UI-Sichtbarkeit allein ist niemals Sicherheitsmaßnahme.

## ADR-005 – Rollen + granulare Permissions
**Status:** Accepted

Rollen dienen als Bündel von Permissions. Sicherheitsentscheidungen basieren auf Permissions, nicht ausschließlich auf hart codierten Rollennamen.

## ADR-006 – Vier getrennte History-Arten
**Status:** Accepted

- Activity: fachliche Arbeit
- Audit: Datenänderungen
- Security: Sicherheitsereignisse
- Compliance: regulatorische Nachweise

Audit-History ist append-only.

## ADR-007 – Optimistic Concurrency
**Status:** Accepted

Veränderliche Geschäftsdaten verwenden Versionsfelder. Bei Versionskonflikten wird nicht blind überschrieben. Kritische Werte werden niemals automatisch gemerged.

## ADR-008 – Migration-first Database Management
**Status:** Accepted

DDL wird über versionierte Migrationen ausgeführt und im Repository gespiegelt. Manuelle Dashboard-Schemaänderungen sind nicht der reguläre Entwicklungsweg.

## ADR-009 – STAGING zuerst / Production geschützt
**Status:** Accepted

Alle Änderungen zuerst in STAGING. Production wird nur nach ausdrücklicher Freigabe verändert.

## ADR-010 – Projektinfrastruktur bleibt eigenständig
**Status:** Accepted

ZeyherMutterOS teilt keine Datenbanktabellen, Storage-Buckets, Worker-Secrets oder Deployment-Routen mit fachlich fremden Projekten. Bei unklarer Ressourcenzuordnung gilt fail closed.

## ADR-011 – Kein zusätzliches ORM zum Start
**Status:** Accepted

Zu Beginn werden Supabase/Postgres und typisierte Datenzugriffe ohne zusätzliche ORM-Abstraktion verwendet. Ein ORM wird erst eingeführt, wenn ein konkreter Nutzen entsteht.

## ADR-012 – Finanzwerte als Decimal/Numeric
**Status:** Accepted

Provisionen und andere Geldwerte werden nicht mit ungeeigneten Floating-Point-Datentypen persistiert oder berechnet.

## ADR-013 – Atomare Domain-Aktionen über eng begrenzte RPCs
**Status:** Accepted

Vorgänge, die mehrere Tabellen konsistent verändern müssen, werden bei Bedarf als kleine PostgreSQL-Funktion umgesetzt. Beispiele: Kontakt + Primäradresse, Kommentar + Mentions und Lead → Immobilie.

**Regel:** Standard ist `SECURITY INVOKER`, damit RLS erhalten bleibt. `SECURITY DEFINER` ist nur für private Trigger/Helfer zulässig, nicht als allgemeine öffentliche Abkürzung für Berechtigungen.

## ADR-014 – Regelbasierte Duplikaterkennung, kein automatischer Merge
**Status:** Accepted

Kontaktduplikate werden nachvollziehbar über E-Mail, normalisierte Mobilnummer und Name + vollständige Anschrift erkannt. Treffer erzeugen eine Warnung. Zusammenführen erfolgt niemals automatisch.

## ADR-015 – Archivieren statt still löschen
**Status:** Accepted

Geschäftsdaten werden standardmäßig archiviert. Archivieren/Wiederherstellen benötigt eigene Permission, setzt serverseitig `archived_by`, erhöht die Version und erzeugt explizite Audit-Aktionen `ARCHIVE` bzw. `RESTORE`.

## ADR-016 – Zentrale CRM-Suche im RLS-Kontext
**Status:** Accepted

Die globale CRM-Suche läuft serverseitig in PostgreSQL als `SECURITY INVOKER` und respektiert RLS. Suchindizes dürfen früh vorbereitet werden; `unused index`-Hinweise in leerem STAGING sind kein Grund, vorgesehene Produktionsindizes vorschnell zu entfernen.

## ADR-017 – Doppelte Autorisierung für sensible Oberflächen
**Status:** Accepted

RLS bleibt die Daten-Sicherheitsgrenze. Zusätzlich verwenden sensible serverseitige Routen einen expliziten Permission-Guard und liefern bei fehlender Permission HTTP 403. Beispiel: globale Systemhistorie benötigt `audit.read`.

## ADR-018 – Immobilienstatus als serverseitige State Machine
**Status:** Accepted

Der Objektworkflow wird nicht nur in der UI abgebildet. PostgreSQL validiert erlaubte Statusübergänge. Ungültige Sprünge werden abgewiesen. Archivierte Objekte können nur in den unmittelbar vorherigen Status zurückkehren.

Zusätzliche fachliche Rechte werden direkt in PostgreSQL geprüft: `property.publish` für den Start der Vermarktung, `property.archive` für Archiv/Restore und `property.assign` für Zuständigkeitswechsel.

## ADR-019 – Private Storage by Default
**Status:** Accepted

Objektdokumente und Medien liegen zunächst ausschließlich in privaten Supabase-Storage-Buckets. Downloads erfolgen authentifiziert bzw. über kurzlebige Signed URLs. Eine Markierung `public_approved` allein veröffentlicht niemals eine Datei.

Eine spätere öffentliche Website erhält eine separate, kontrollierte Publikationsschicht. Vertrauliche Dokumente werden niemals automatisch öffentlich.

## ADR-020 – Dokumentversionen sind append-only
**Status:** Accepted

Neue Dateistände erzeugen immer eine neue `DocumentVersion` mit eigener Storage-Adresse, fortlaufender Versionsnummer, SHA-256, MIME-Type, Größe, Originaldateiname, Benutzer und Änderungsgrund. Upsert/Überschreiben bestehender Dokumentdateien ist nicht Teil des Workflows.

## ADR-021 – Leads erweitern das CRM, sie ersetzen es nicht
**Status:** Accepted

Ein Lead ist ein eigener fachlicher Vorgang, aber kein zweites Kontaktsystem. Verkäufer-Leads referenzieren vorhandene CRM-Kontakte; mehrere Leads je Kontakt sind ausdrücklich zulässig. Neue Personen werden über die vorhandene CRM-Kontaktanlage und Duplikaterkennung erzeugt.

**Warum:** Kontaktidentität, Adressen, Beziehungen, Aktivitäten und Duplikaterkennung bleiben an einer Stelle konsistent.

## ADR-022 – Leadstatus und Leadquelle sind orthogonal
**Status:** Accepted

Der Bearbeitungsstatus eines Leads und seine Herkunft werden separat gespeichert. Ein Statuswechsel verändert niemals rückwirkend die Attribution. Verlustgründe werden nur bei `LOST` fachlich relevant und bleiben für Auswertungen erhalten.

## ADR-023 – Lead-Pipeline als serverseitige State Machine
**Status:** Accepted

Die Verkäufer-Lead-Pipeline verwendet definierte Übergänge zwischen `NEW`, `CONTACTED`, `QUALIFIED`, `APPOINTMENT`, `VALUATION`, `OFFER`, `WON`, `LOST` und `NURTURE`. PostgreSQL blockiert unzulässige direkte Sprünge. Archivieren/Wiederherstellen ist davon getrennt und erfolgt mit eigener Permission.

Die erste UI verwendet explizite Statusaktionen statt Drag & Drop. Dadurch bleiben State Machine und Optimistic Concurrency sichtbar und zuverlässig; Drag & Drop kann später ergänzt werden, darf diese Regeln aber niemals umgehen.

## ADR-024 – Lead → Immobilie ist atomar und idempotent
**Status:** Accepted

Ein gewonnener Verkäufer-Lead wird über die PostgreSQL-Funktion `convert_lead_to_property` in eine Immobilie überführt. Der Workflow läuft vollständig in einer Transaktion und erzeugt bzw. verknüpft mindestens:

- neue Immobilie im regulären Anfangsstatus `DRAFT`
- reguläre automatische Objektnummer
- Objektadresse, sofern die Lead-Adresse vollständig ist
- CRM-Kontakt als 100%-Eigentümer
- relevante Objekt-/Bewertungswerte
- primär verantwortlichen Benutzer
- Lead-Konvertierungsmetadaten
- Activity-Eintrag

Die Funktion benötigt `lead.convert` und die erforderlichen Immobilienberechtigungen, sperrt den Lead während der Konvertierung und prüft die erwartete Lead-Version. Ist ein Lead bereits konvertiert, wird die vorhandene Immobilien-ID zurückgegeben; ein Retry erzeugt keine zweite Immobilie.

## ADR-025 – Verkäufer-Bewertungswerte bleiben bis zur Objektübernahme Lead-Daten
**Status:** Accepted

Bewertungstermin, geschätzter Marktwert, Bewertungsnotiz, Angebotszeitpunkt, angebotene Provision und Angebotskonditionen werden während der Akquise am Lead geführt. Finanzwerte werden als PostgreSQL `numeric` gespeichert. Bei der Konvertierung werden nur fachlich passende Werte in die Immobilienakte übernommen; der Lead bleibt als Herkunfts- und Prozessnachweis bestehen.

## ADR-026 – Interessenten bleiben CRM-Kontakte
**Status:** Accepted

Ein Kauf- oder Mietinteressent erhält kein zweites Personen-Stammdatenobjekt. Identität, Kontaktwege, Beziehungen und Duplikaterkennung bleiben im bestehenden CRM-Kontakt. Ein Kontakt kann beliebig viele fachlich getrennte Suchprofile besitzen.

**Warum:** Eine Person kann gleichzeitig mehrere Suchwünsche haben, ohne mehrfach im CRM angelegt zu werden. Historie und Kommunikation bleiben an einer Identität konsistent.

## ADR-027 – Suchprofile sind versionierte Geschäftsvorgänge mit normalisierten Suchorten
**Status:** Accepted

Suchprofile speichern Kauf-/Mietart, Immobilientypen, Budget, Flächen, Zimmer, Grundstück, Baujahr, Einzugswunsch, Finanzierung und gewünschte Merkmale. Mehrere Zielregionen werden in `search_profile_locations` separat gespeichert statt als unstrukturierter Freitext.

Suchprofile verwenden RLS, granulare Permissions, Audit-History, Archivieren/Wiederherstellen und Optimistic Concurrency. Die atomare Neuanlage eines Profils mit erstem Suchort erfolgt über `create_search_profile` als `SECURITY INVOKER`.

**Warum:** Das spätere Immobilien-Matching muss Kriterien und Regionen nachvollziehbar bewerten können. Normalisierte Suchorte erlauben PLZ-/Ort-/Radius-Matching ohne Migration von Freitextdaten.

## ADR-028 – Suchprofil braucht mindestens einen gültigen Suchort mit Radius
**Status:** Accepted

Neue Suchprofile dürfen fachlich nicht ohne Suchgebiet existieren. Ein Suchgebiet benötigt mindestens PLZ oder Ort sowie einen positiven Radius bis zum definierten Maximalwert. Die normale Anlage bleibt atomar; zusätzlich erzwingt ein deferred Datenbank-Guard am Transaktionsende, dass ein neu angelegtes Suchprofil mindestens einen gültigen Suchort besitzt.

Reine fünfstellige Werte, die im Altbestand irrtümlich als Ort gespeichert wurden, werden migrationsbasiert als PLZ normalisiert. Die Normalisierung greift auch bei neuen direkten Tabellenänderungen.

## ADR-029 – Standortmatching priorisiert eindeutige Treffer vor Distanzberechnung
**Status:** Accepted

Die Standortbewertung folgt einer nachvollziehbaren Reihenfolge:

1. exakt gleiche PLZ,
2. passender Ortsteil,
3. exakt gleicher Ort,
4. Distanzberechnung anhand vorhandener Koordinaten und Radius,
5. andernfalls nachvollziehbarer Nicht-Treffer.

Ein exakter PLZ- oder Ortstreffer darf nicht wegen fehlender Koordinaten als außerhalb des Suchgebiets bewertet werden. Match-Gründe werden als fachliche Texte zurückgegeben.

## ADR-030 – Reverse Matching verwendet dieselbe Matching-Engine
**Status:** Accepted

Die Immobilienakte zeigt passende Interessenten über `match_search_profiles_for_property`, das intern dieselbe Berechnungslogik wie Suchprofil → Immobilie verwendet. Es gibt keine zweite, separat gepflegte Reverse-Matching-Formel.

**Warum:** Ein Match muss unabhängig von der Einstiegsrichtung denselben Score und dieselben Gründe liefern. Dadurch bleibt die Berechnung testbar und fachlich konsistent.

## ADR-031 – Besichtigungsstatus darf kontrolliert korrigiert werden
**Status:** Accepted

`COMPLETED` ist kein irreversibler Bedienfehler. Eine durchgeführte Besichtigung darf bewusst und auditierbar zurück auf `CONFIRMED` oder `PLANNED` korrigiert werden. Die UI verlangt eine Bestätigung; vorhandenes Feedback oder vorhandene Kaufangebote werden niemals automatisch gelöscht oder verändert.

Alle übrigen Statuswechsel bleiben durch die serverseitige State Machine begrenzt.

## ADR-032 – Kaufangebote sind historische Preisstände, nicht überschreibbare Einzelzeilen
**Status:** Accepted

Kaufangebote verwenden das eindeutige fachliche Präfix `ZM-KA-######`. Ein `DRAFT` ist bearbeitbar. Nach Abgabe sind Betrag und wesentliche Angebotsdaten unveränderlich; Änderungen erfolgen über ein neues Folgeangebot mit Referenz auf den vorherigen Preisstand.

Wird ein neues Folgeangebot abgegeben, wird das vorherige aktive Angebot als `REPLACED` markiert. Pro Kontakt + Immobilie darf höchstens ein aktives abgegebenes Angebot existieren. Alte Angebote bleiben als Historie erhalten.

## ADR-033 – Allgemeine und objektbezogene Anfragen unterscheiden sich beim Abschluss
**Status:** Accepted

Eine objektbezogene Interessentenanfrage darf nicht auf `CLOSED` gesetzt werden, solange keine Immobilie verknüpft ist. Allgemeine Website-Kontaktanfragen aus Modul 05 dürfen dagegen ohne Objektbezug abgeschlossen werden.

Diese Regel wird in PostgreSQL erzwungen und nicht nur im Frontend dargestellt.

## ADR-034 – Wiederverwendbare Aufgaben- und Konfliktmodals
**Status:** Accepted

Aufgaben werden in Suchprofil-, Anfrage- und Besichtigungskontexten über eine gemeinsame Modal-Komponente geöffnet. Technische Status- und Prioritätswerte werden dort in deutsche Klarnamen übersetzt. Optimistic-Concurrency-Konflikte werden ebenfalls über eine gemeinsame sichtbare Modal-Komponente angezeigt, statt als leicht übersehbare Meldung am Seitenanfang.

## ADR-035 – API-Rollen erhalten nur explizit benötigte Rechte
**Status:** Accepted

`anon` erhält keinen pauschalen Tabellen-, Sequenz- oder RPC-Zugriff. Anonym lesbar sind nur die freigegebenen Publikations-Snapshots und ausdrücklich öffentliche Listing-RPCs. `authenticated` erhält die fachlich erforderlichen CRUD-Rechte, aber keine pauschalen Rechte wie `TRUNCATE`, `REFERENCES` oder `TRIGGER`. Neue Datenbankobjekte übernehmen diese Defaults.

## ADR-036 – Vermarktungsbereitschaft ist eine Datenbankinvariante
**Status:** Accepted

Der Übergang einer Immobilie von `PREPARATION` zu `MARKETING` benötigt `property.publish`, einen Verantwortlichen, mindestens einen aktiven Eigentümer, eine vollständige strukturierte Adresse, einen positiven transaktionsspezifischen Preis sowie ausschließlich erledigte oder bewusst erlassene Pflicht-Checklistenpunkte. PostgreSQL erzwingt dies unabhängig vom Client.

## ADR-037 – Öffentliche Medien bleiben privat gespeichert und werden gestreamt
**Status:** Accepted

Auch freigegebene Website-Medien verbleiben im privaten Supabase-Bucket. Der Worker autorisiert den fachlichen Datensatz über RLS, erstellt eine kurzlebige Signed URL und streamt die Upstream-Antwort. Er lädt große Dateien nicht vollständig in den Worker-Speicher. Cache-, Range-, ETag- und Sicherheitsheader bleiben kontrolliert.

## ADR-038 – Anfrage → Suchprofil ist atomar
**Status:** Accepted

Die Anlage eines Suchprofils aus einer Anfrage und die Rückverknüpfung der Anfrage erfolgen in einer `SECURITY INVOKER`-RPC. Die Funktion prüft beide Schreibrechte, sperrt die Anfrage, validiert Kontakt, Archivstatus und erwartete Version und rollt bei jedem Fehler vollständig zurück. Ein bereits verknüpfter Datensatz wird nicht still überschrieben.

## ADR-039 – Reproduzierbarer pnpm-Build mit getrennten TypeScript-Kontexten
**Status:** Accepted

Das Repository pinnt pnpm und enthält einen Lockfile. Browser-/React-Router-Code und Cloudflare-Worker-Code werden in getrennten TypeScript-Projekten geprüft, damit DOM- und Worker-Globals nicht versehentlich vermischt werden. Das zentrale Qualitätsgate umfasst Typgenerierung, striktes TypeScript, Produktions-Build und Wrangler-Dry-Run.

## ADR-040 – `develop` liefert BETA, `main` liefert PROD
**Status:** Accepted

`develop` ist die einzige dauerhafte Integrationslinie und wird nach erfolgreichem Quality Gate nach BETA ausgerollt. `main` enthält ausschließlich für PROD freigegebene Stände. Releases gelangen per Pull Request von `develop` nach `main`; Hotfixes werden anschließend nach `develop` zurückgeführt.

BETA und PROD verwenden getrennte Cloudflare Worker, Supabase-Projekte, Keys, Auth-Konfigurationen, Storage-Buckets und Daten. Ein uneindeutiger Deploy-Befehl ist verboten. PROD benötigt einen sauberen `main`, vollständig konfigurierte PROD-Werte und eine explizite Freigabe; fehlende Angaben führen zum Abbruch.
