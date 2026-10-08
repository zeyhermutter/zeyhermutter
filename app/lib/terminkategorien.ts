// Die Terminkategorien des CRM-Kalenders -- an einer Stelle.
//
// WARUM ES DIESE DATEI GIBT
//
// Der Kalender zieht Termine aus neun Quellen zusammen. Die Beschriftung
// stand frueher in jeder Schleife des Ladeteils von app/routes/calendar.tsx
// als eigene Zeichenkette.
//
// Dass es neun und nicht fuenf sind, kam durch eine Frage heraus: "werden
// alle Termine, auch Aufmass, im Kalender hinterlegt?" Nein -- drei
// Zeitpunkte standen in der Datenbank und in keiner Agenda: der Aufmasstermin,
// die Uebergabe, die Begehung zum Verkaufsstrategie-Check und die
// Wiedervorlage am Verkaufsprojekt. Ein Terminfeld, das
// niemand sieht, ist kein Termin, sondern eine Notiz.
//
// Mit dem Monatsraster braucht dieselbe Liste jetzt an drei weiteren Stellen
// dieselbe Auskunft: welche Farbe, welches Kuerzel, welche Beschriftung. Eine
// Kategorie, die in der Legende fehlt, ist im Raster ein farbloser Punkt --
// und das faellt niemandem auf, der die Seite nicht Tag fuer Tag liest.
//
// scripts/check-terminfarben.mjs vergleicht diese Liste bei jedem Build mit
// dem Typ CalendarKind, mit den Regeln in app/calendar.css und rechnet die
// Kontraste nach. Eine zehnte Kategorie kann damit nicht mehr stillschweigend
// ohne Farbe und ohne Legende durchrutschen.
//
// UNTERSCHIEDEN WIRD NACH FARBE UND BUCHSTABE
//
// Neun Farben sind weit mehr, als sich allein ueber den Farbton zuverlaessig
// trennen laesst -- schon bei fuenf lagen Violett, Blau und Gruen in der
// Helligkeit nur den Faktor 1,1 auseinander. Jede Marke traegt deshalb
// zusaetzlich einen Buchstaben: A, W, P, E, V, B, M, N, Ü -- alle neun
// verschieden. Wer die Farben nicht unterscheidet, liest die Buchstaben.

export type Terminkategorie =
  | "TASK" | "LEAD_FOLLOWUP" | "PROJECT_FOLLOWUP" | "LEAD_VALUATION"
  | "VIEWING" | "READINESS_INSPECTION" | "MEASUREMENT" | "CLOSING_NOTARY" | "HANDOVER";

export type Kategoriebeschreibung = {
  /** Der Wert, den der Ladeteil setzt. */
  schluessel: Terminkategorie;
  /** Was auf dem Bildschirm steht -- in der Agenda wie in der Legende. */
  beschriftung: string;
  /** Ein Buchstabe fuer die Marke im Monatsraster. Alle neun verschieden. */
  kuerzel: string;
  /** Die Klasse, die Farbe und Rahmen in app/calendar.css setzt. */
  klasse: string;
  /** Wohin der Verweis "Quelle oeffnen" unter dem Kalender fuehrt. */
  uebersichtPfad: string;
  /** Wie dieser Verweis heisst. Mehrere Kategorien duerfen denselben teilen. */
  uebersichtBeschriftung: string;
  /**
   * Die Berechtigung, ohne die diese Quelle gar nicht gelesen werden kann.
   * Steht hier null, entscheidet allein die Zeilensicherheit der Tabelle.
   *
   * Ohne diese Angabe stand eine Kategorie in der Legende, deren Zeilen die
   * Zeilensicherheit fuer die meisten Rollen wegfiltert: kein Fehler, nur
   * dauerhaft null Eintraege. Eine Farbe, die nie etwas beschriftet, ist eine
   * Luege ueber den Datenbestand.
   */
  berechtigung: string | null;
  /**
   * true, wenn die Quellspalte ein reines Datum ohne Uhrzeit ist. Solche
   * Termine laufen als ganztaegig -- in der Agenda ohne erfundene Uhrzeit,
   * im .ics als DTSTART;VALUE=DATE.
   */
  ganztags: boolean;
};

/** In der Reihenfolge des Arbeitsvorgangs, nicht alphabetisch. */
export const TERMINKATEGORIEN: Kategoriebeschreibung[] = [
  { schluessel: "TASK", beschriftung: "Aufgabe / interner Termin", kuerzel: "A", klasse: "termin-aufgabe",
    uebersichtPfad: "/crm/tasks", uebersichtBeschriftung: "Aufgaben", berechtigung: null, ganztags: false },
  { schluessel: "LEAD_FOLLOWUP", beschriftung: "Wiedervorlage", kuerzel: "W", klasse: "termin-wiedervorlage",
    uebersichtPfad: "/leads", uebersichtBeschriftung: "Verkäufer-Leads", berechtigung: null, ganztags: false },
  { schluessel: "PROJECT_FOLLOWUP", beschriftung: "Fälliger Schritt am Verkaufsprojekt", kuerzel: "P", klasse: "termin-projekt",
    uebersichtPfad: "/projects", uebersichtBeschriftung: "Verkaufsprojekte", berechtigung: null, ganztags: true },
  { schluessel: "LEAD_VALUATION", beschriftung: "Eigentümertermin", kuerzel: "E", klasse: "termin-eigentuemer",
    uebersichtPfad: "/leads", uebersichtBeschriftung: "Verkäufer-Leads", berechtigung: null, ganztags: false },
  { schluessel: "READINESS_INSPECTION", beschriftung: "Begehung Verkaufsstrategie-Check", kuerzel: "V", klasse: "termin-begehung",
    uebersichtPfad: "/crm/sales-readiness", uebersichtBeschriftung: "Verkaufsstrategie-Checks", berechtigung: "sales_readiness.read", ganztags: false },
  { schluessel: "VIEWING", beschriftung: "Besichtigung", kuerzel: "B", klasse: "termin-besichtigung",
    uebersichtPfad: "/viewings", uebersichtBeschriftung: "Besichtigungen", berechtigung: null, ganztags: false },
  { schluessel: "MEASUREMENT", beschriftung: "Aufmaßtermin", kuerzel: "M", klasse: "termin-aufmass",
    uebersichtPfad: "/measurements", uebersichtBeschriftung: "Aufmaßaufträge", berechtigung: "measurement.read", ganztags: false },
  { schluessel: "CLOSING_NOTARY", beschriftung: "Notartermin", kuerzel: "N", klasse: "termin-notar",
    uebersichtPfad: "/closings", uebersichtBeschriftung: "Abschlüsse & Notar", berechtigung: null, ganztags: false },
  { schluessel: "HANDOVER", beschriftung: "Übergabe", kuerzel: "Ü", klasse: "termin-uebergabe",
    uebersichtPfad: "/closings", uebersichtBeschriftung: "Abschlüsse & Notar", berechtigung: null, ganztags: false },
];

/** Die Verweise unter dem Kalender -- jeder Weg einmal, in Kategorienreihenfolge. */
export function uebersichtsWege(sichtbar: Terminkategorie[]) {
  const gesehen = new Set<string>();
  const wege: Array<{ pfad: string; beschriftung: string }> = [];
  for (const art of TERMINKATEGORIEN) {
    if (!sichtbar.includes(art.schluessel) || gesehen.has(art.uebersichtPfad)) continue;
    gesehen.add(art.uebersichtPfad);
    wege.push({ pfad: art.uebersichtPfad, beschriftung: art.uebersichtBeschriftung });
  }
  return wege;
}

const NACH_SCHLUESSEL = new Map(TERMINKATEGORIEN.map((k) => [k.schluessel, k]));

export function kategorie(schluessel: Terminkategorie): Kategoriebeschreibung {
  const gefunden = NACH_SCHLUESSEL.get(schluessel);
  if (!gefunden) throw new Error(`Terminkategorie ${schluessel} ist in TERMINKATEGORIEN nicht beschrieben.`);
  return gefunden;
}
