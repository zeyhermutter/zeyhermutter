// Die Terminkategorien des CRM-Kalenders -- an einer Stelle.
//
// WARUM ES DIESE DATEI GIBT
//
// Der Kalender zieht Termine aus fuenf Quellen zusammen: Aufgaben,
// Wiedervorlagen, Eigentuemertermine, Besichtigungen, Notartermine. Die
// Beschriftung dieser fuenf stand bisher fuenfmal im Ladeteil von
// app/routes/calendar.tsx, jeweils als Zeichenkette in der Schleife.
//
// Mit dem Monatsraster braucht dieselbe Liste jetzt an drei weiteren Stellen
// dieselbe Auskunft: welche Farbe, welches Kuerzel, welche Beschriftung. Eine
// Kategorie, die in der Legende fehlt, ist im Raster ein farbloser Punkt --
// und das faellt niemandem auf, der die Seite nicht Tag fuer Tag liest.
//
// scripts/check-terminfarben.mjs vergleicht diese Liste bei jedem Build mit
// dem Typ CalendarKind, mit den Regeln in app/calendar.css und rechnet die
// Kontraste nach. Eine sechste Kategorie kann damit nicht mehr stillschweigend
// ohne Farbe und ohne Legende durchrutschen.
//
// UNTERSCHIEDEN WIRD NACH FARBE UND BUCHSTABE
//
// Fuenf Farben sind mehr, als sich allein ueber den Farbton zuverlaessig
// trennen laesst: Violett, Blau und Gruen liegen in der Helligkeit nur den
// Faktor 1,1 auseinander und sind fuer rund acht Prozent der Maenner nahe
// beieinander. Jede Marke traegt deshalb zusaetzlich den Anfangsbuchstaben
// ihrer Kategorie -- A, W, E, B, N, alle fuenf verschieden.

export type Terminkategorie = "TASK" | "LEAD_FOLLOWUP" | "LEAD_VALUATION" | "VIEWING" | "CLOSING_NOTARY";

export type Kategoriebeschreibung = {
  /** Der Wert, den der Ladeteil setzt. */
  schluessel: Terminkategorie;
  /** Was auf dem Bildschirm steht -- in der Agenda wie in der Legende. */
  beschriftung: string;
  /** Ein Buchstabe fuer die Marke im Monatsraster. Alle fuenf verschieden. */
  kuerzel: string;
  /** Die Klasse, die Farbe und Rahmen in app/calendar.css setzt. */
  klasse: string;
};

/** In der Reihenfolge des Arbeitsvorgangs, nicht alphabetisch. */
export const TERMINKATEGORIEN: Kategoriebeschreibung[] = [
  { schluessel: "TASK", beschriftung: "Aufgabe / interner Termin", kuerzel: "A", klasse: "termin-aufgabe" },
  { schluessel: "LEAD_FOLLOWUP", beschriftung: "Wiedervorlage", kuerzel: "W", klasse: "termin-wiedervorlage" },
  { schluessel: "LEAD_VALUATION", beschriftung: "Eigentümertermin", kuerzel: "E", klasse: "termin-eigentuemer" },
  { schluessel: "VIEWING", beschriftung: "Besichtigung", kuerzel: "B", klasse: "termin-besichtigung" },
  { schluessel: "CLOSING_NOTARY", beschriftung: "Notartermin", kuerzel: "N", klasse: "termin-notar" },
];

const NACH_SCHLUESSEL = new Map(TERMINKATEGORIEN.map((k) => [k.schluessel, k]));

export function kategorie(schluessel: Terminkategorie): Kategoriebeschreibung {
  const gefunden = NACH_SCHLUESSEL.get(schluessel);
  if (!gefunden) throw new Error(`Terminkategorie ${schluessel} ist in TERMINKATEGORIEN nicht beschrieben.`);
  return gefunden;
}
