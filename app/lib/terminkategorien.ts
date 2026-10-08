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
};

/** In der Reihenfolge des Arbeitsvorgangs, nicht alphabetisch. */
export const TERMINKATEGORIEN: Kategoriebeschreibung[] = [
  { schluessel: "TASK", beschriftung: "Aufgabe / interner Termin", kuerzel: "A", klasse: "termin-aufgabe" },
  { schluessel: "LEAD_FOLLOWUP", beschriftung: "Wiedervorlage", kuerzel: "W", klasse: "termin-wiedervorlage" },
  { schluessel: "PROJECT_FOLLOWUP", beschriftung: "Wiedervorlage Verkaufsprojekt", kuerzel: "P", klasse: "termin-projekt" },
  { schluessel: "LEAD_VALUATION", beschriftung: "Eigentümertermin", kuerzel: "E", klasse: "termin-eigentuemer" },
  { schluessel: "READINESS_INSPECTION", beschriftung: "Begehung Verkaufsstrategie-Check", kuerzel: "V", klasse: "termin-begehung" },
  { schluessel: "VIEWING", beschriftung: "Besichtigung", kuerzel: "B", klasse: "termin-besichtigung" },
  { schluessel: "MEASUREMENT", beschriftung: "Aufmaßtermin", kuerzel: "M", klasse: "termin-aufmass" },
  { schluessel: "CLOSING_NOTARY", beschriftung: "Notartermin", kuerzel: "N", klasse: "termin-notar" },
  { schluessel: "HANDOVER", beschriftung: "Übergabe", kuerzel: "Ü", klasse: "termin-uebergabe" },
];

const NACH_SCHLUESSEL = new Map(TERMINKATEGORIEN.map((k) => [k.schluessel, k]));

export function kategorie(schluessel: Terminkategorie): Kategoriebeschreibung {
  const gefunden = NACH_SCHLUESSEL.get(schluessel);
  if (!gefunden) throw new Error(`Terminkategorie ${schluessel} ist in TERMINKATEGORIEN nicht beschrieben.`);
  return gefunden;
}
