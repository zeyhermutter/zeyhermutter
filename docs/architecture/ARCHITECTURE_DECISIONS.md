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

Supabase PostgreSQL, Auth, Storage und Realtime. Eigenes Projekt für ZeyherMutterOS-STAGING; SeasonCrew-Ressourcen werden niemals geteilt.

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

## ADR-010 – Keine gemeinsame SeasonCrew-Infrastruktur
**Status:** Accepted

Keine gemeinsamen Supabase-Projekte, Tabellen, Buckets, Worker, Secrets oder Deployment-Routen. Bei unklarer Ressourcenzuordnung gilt fail closed.

## ADR-011 – Kein zusätzliches ORM zum Start
**Status:** Accepted

Zu Beginn werden Supabase/Postgres und typisierte Datenzugriffe ohne zusätzliche ORM-Abstraktion verwendet. Ein ORM wird erst eingeführt, wenn ein konkreter Nutzen entsteht.

## ADR-012 – Finanzwerte als Decimal/Numeric
**Status:** Accepted

Provisionen und andere Geldwerte werden nicht mit ungeeigneten Floating-Point-Datentypen persistiert oder berechnet.

## ADR-013 – Atomare Domain-Aktionen über eng begrenzte RPCs
**Status:** Accepted

Vorgänge, die mehrere Tabellen konsistent verändern müssen, werden bei Bedarf als kleine PostgreSQL-Funktion umgesetzt. Beispiele: Kontakt + Primäradresse und Kommentar + Mentions.

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
