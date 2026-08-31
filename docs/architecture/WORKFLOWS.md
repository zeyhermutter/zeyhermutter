# ZeyherMutterOS – Kritische Workflows

Stand: 31.08.2026

## Lead → Immobilie

1. Lead erreicht `WON` und erfüllt Kontakt-, Adress-, Verantwortungs- und Bewertungsanforderungen.
2. `convert_lead_to_property` prüft Permission und erwartete Version und sperrt den Lead.
3. Immobilie, Adresse, Eigentümerrelation, Activity und Rückverknüpfung entstehen in einer Transaktion.
4. Retry liefert die bestehende Objekt-ID; es entsteht kein Duplikat.

## Immobilie → Vermarktung

Der Übergang `PREPARATION → MARKETING` ist nur mit `property.publish` möglich. Die Datenbank verlangt Verantwortlichen, aktiven Eigentümer, vollständige Adresse, positiven Kauf- oder Mietpreis und eine abgeschlossene/erlassene Pflichtcheckliste. Die UI erklärt den konkreten Ablehnungsgrund; ein direkter API-Aufruf kann die Regel nicht umgehen.

## Anfrage → Suchprofil

`create_search_profile_from_inquiry` prüft `inquiry.write` und `search_profile.write`, Kontaktgleichheit, Archivstatus und Anfrageversion. Suchprofil, erster Suchort und Rückverknüpfung werden atomar geschrieben. Paralleländerung oder vorhandene Verknüpfung erzeugt einen Konflikt statt eines stillen Überschreibens.

## Suchprofil ↔ Immobilie

Exakte PLZ, Ortsteil, Ort und danach Koordinaten/Radius werden nachvollziehbar bewertet. Vorwärts- und Reverse-Matching benutzen dieselbe Engine. Entscheidungen wie `INTERESTED`, `SENT`, `VIEWING_REQUESTED` oder `REJECTED` bleiben getrennt vom berechneten Score.

## Anfrageabschluss

Objektbezogene Anfragen dürfen ohne verknüpfte Immobilie nicht `CLOSED` werden. Nur die definierte allgemeine Website-Kontaktanfrage ist ohne Objekt abschließbar. Die Regel gilt in PostgreSQL für UI, API und direkte Tabellenzugriffe.

## Veröffentlichung

1. Interne Veröffentlichungsakte bearbeiten.
2. Reviewstatus und fachliche Rechte prüfen.
3. Unveränderlichen Snapshot erzeugen und als aktuelle öffentliche Version markieren.
4. Öffentliche RPCs lesen ausschließlich aktuelle Snapshots, niemals `properties` direkt.
5. Neue interne Änderungen verändern die Liveversion erst nach einer neuen Freigabe.

## Öffentliche Medien und Exposés

Website-Medien bleiben privat gespeichert. Der Worker prüft den freigegebenen Metadatensatz, erzeugt eine 30-Sekunden-Signed-URL und streamt die Antwort. Exposé-Generierung referenziert eine konkrete Publikationsversion, damit Inhalt und Freigabestand reproduzierbar bleiben.

## Fehler- und Konfliktregel

Kritische Fachänderungen verwenden erwartete Versionsnummern. Bei Konflikten wird HTTP 409 bzw. ein fachlicher Datenbankfehler geliefert. Kritische Werte werden nicht automatisch gemerged; der Benutzer lädt den aktuellen Stand neu.
