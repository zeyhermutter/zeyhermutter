// Anzeigeformate — eine Fassung für die ganze Anwendung.
//
// Vorher hatte fast jede Route ihre eigenen Kopien: 27 money(), 58
// Datumsformatierer, 13 beziehungsweise 26 verschiedene Varianten davon. Der
// Preis dafür war nicht nur Wiederholung, sondern ein Fehler, der sich
// mitvervielfältigt hat: 18 der 27 money()-Fassungen machten aus "nichts
// erfasst" einen Betrag von 0 €, und 10 der Datumsfassungen behandelten null
// gar nicht. Nachgemessen am Stand 255fb4d, indem jede Funktion mit null,
// undefined und leerem Text aufgerufen wurde.
//
// Die Regel, die hier durchgesetzt wird, steht im Master-Prompt: keine
// erfundenen Zahlen. Wo nichts erfasst ist, steht ein Strich — keine Null, die
// wie ein Wert aussieht.
//
// scripts/check-anzeigeformate.mjs prüft das bei jedem Build nach.

type Wert = number | string | null | undefined;

/** Nichts erfasst: null, undefined oder leerer Text. Eine 0 ist ein Wert. */
export function istLeer(wert: Wert): boolean {
  return wert === null || wert === undefined || wert === "";
}

function alsZahl(wert: Wert): number | null {
  if (istLeer(wert)) return null;
  const n = Number(wert);
  return Number.isFinite(n) ? n : null;
}

// --- Geldbeträge -----------------------------------------------------------

function euroFormat(n: number, nachkomma: 0 | 2): string {
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: nachkomma,
    maximumFractionDigits: nachkomma,
  }).format(n);
}

/** Betrag in vollen Euro. Ohne Wert der Ersatztext, standardmäßig ein Strich. */
export function euroRund(wert: Wert, wennLeer = "—"): string {
  const n = alsZahl(wert);
  return n === null ? wennLeer : euroFormat(n, 0);
}

/** Betrag mit Cent. Ohne Wert der Ersatztext, standardmäßig ein Strich. */
export function euroGenau(wert: Wert, wennLeer = "—"): string {
  const n = alsZahl(wert);
  return n === null ? wennLeer : euroFormat(n, 2);
}

// --- Zahlen ----------------------------------------------------------------

/**
 * Zahl mit Tausenderpunkten. Ohne Wert der Ersatztext.
 *
 * `nachkomma` ist die HOECHSTE Zahl an Nachkommastellen, nicht die feste:
 * zahl(12, 1) ergibt "12", zahl(12.34, 1) ergibt "12,3". So steht in einer
 * Kennzahl keine Genauigkeit, die gar nicht gemessen wurde.
 */
export function zahl(wert: Wert, nachkomma = 0, wennLeer = "—"): string {
  const n = alsZahl(wert);
  if (n === null) return wennLeer;
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: nachkomma }).format(n);
}

/** Fläche in Quadratmetern. */
export function flaeche(wert: Wert, wennLeer = "—"): string {
  const n = alsZahl(wert);
  return n === null ? wennLeer : `${zahl(n, 2)} m²`;
}

/** Prozentsatz. */
export function prozent(wert: Wert, nachkomma = 1, wennLeer = "—"): string {
  const n = alsZahl(wert);
  return n === null ? wennLeer : `${zahl(n, nachkomma)} %`;
}

// --- Datum und Zeit --------------------------------------------------------
//
// Ein reines Tagesdatum aus der Datenbank ("2026-09-12") wird von new Date()
// als Mitternacht UTC gelesen. In einer Zeitzone westlich von Greenwich fiele
// die Anzeige damit auf den Vortag. Deshalb wird bei einem reinen Tagesdatum
// die Mittagszeit ergänzt — bei einem vollständigen Zeitstempel natürlich
// nicht, dort waere das Anhaengen sogar ein ungueltiges Datum.

const NUR_TAG = /^\d{4}-\d{2}-\d{2}$/;

function alsDatum(wert: Wert): Date | null {
  if (istLeer(wert)) return null;
  const text = String(wert);
  const d = new Date(NUR_TAG.test(text) ? `${text}T12:00:00Z` : text);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Tagesdatum, etwa "12. Sept. 2026". Verträgt Tagesdatum und Zeitstempel. */
export function tag(wert: Wert, wennLeer = "—"): string {
  const d = alsDatum(wert);
  if (!d) return wennLeer;
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeZone: "Europe/Berlin" }).format(d);
}

/** Tagesdatum kurz, etwa "12.09.2026". Fuer enge Listenspalten. */
export function tagKurz(wert: Wert, wennLeer = "—"): string {
  const d = alsDatum(wert);
  if (!d) return wennLeer;
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeZone: "Europe/Berlin" }).format(d);
}

/** Zeitpunkt mit Uhrzeit, etwa "12. Sept. 2026, 09:30". */
export function zeitpunkt(wert: Wert, wennLeer = "—"): string {
  const d = alsDatum(wert);
  if (!d) return wennLeer;
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin",
  }).format(d);
}

/** Zeitpunkt kurz, etwa "12.09.2026, 09:30". */
export function zeitpunktKurz(wert: Wert, wennLeer = "—"): string {
  const d = alsDatum(wert);
  if (!d) return wennLeer;
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin",
  }).format(d);
}

/** Nur die Uhrzeit, etwa "09:30". */
export function uhrzeit(wert: Wert, wennLeer = "—"): string {
  const d = alsDatum(wert);
  if (!d) return wennLeer;
  return new Intl.DateTimeFormat("de-DE", {
    hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin",
  }).format(d);
}

// --- Sprache ---------------------------------------------------------------

/**
 * Singular oder Plural, je nach Anzahl. Verhindert "1 Reaktionen", das in
 * einer Kachel kaum auffällt und in einem ganzen Satz falsch klingt.
 */
export function plural(anzahl: number, einzahl: string, mehrzahl: string): string {
  return `${anzahl} ${anzahl === 1 ? einzahl : mehrzahl}`;
}
