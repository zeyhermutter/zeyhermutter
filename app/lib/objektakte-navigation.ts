// Die Navigation der Objektakte -- an einer Stelle.
//
// WIE SIE ENTSTAND
//
// In der Leiste ueber der Objektakte standen einmal 19 Links in einer Zeile,
// ohne Rangfolge, Abschnitte dieser Akte und Verweise in andere Akten
// gemischt. Im September wurden daraus zwei Zeilen, die Abschnitte nach der
// Phase der Immobilie gefaltet ("+ 5 weitere Abschnitte").
//
// Am 12.10.2026 wurde die Akte zum Programm-Arbeitsplatz (Liste links, Akte
// rechts), und Sebastian wollte sie so aufgeraeumt wie die Kontaktakte. 14
// Abschnitte nebeneinander sind dafuer zu viele, und das Falten nach Phase
// hiess: was man sucht, ist manchmal weg. Jetzt sind es neun REITER, die immer
// gleich dastehen, und unter dem gewaehlten Reiter seine Seiten:
//
//   Uebersicht | Objektdaten | Eigentuemer & Recht | Preis & Wert | Unterlagen
//   | Vermarktung | Interessenten | Abwicklung | Verlauf
//
// Die Uebersicht war bis dahin eine einzige lange Seite mit Fahrplan, Status,
// Zusammenfassungen, Stammdatenformular, Adresse, Eigentuemern, Ausstattung
// und Historie. Sie ist in vier Teile zerlegt (Uebersicht, Objektdaten,
// Eigentuemer, Verlauf) -- dieselbe Routendatei, vier Adressen. Siehe TEILE.
//
// Die Vorgaenge (Maklerauftrag, Kaufangebote ...) sind eigene Akten, nach
// dieser Immobilie gefiltert. Sie stehen unter "Abwicklung", mit Pfeil, weil
// sie aus der Objektakte herausfuehren.
//
// scripts/check-objektakte-navigation.mjs haelt die Liste gegen app/routes.ts.

export type Seite = {
  /** Letztes Pfadstueck unter /properties/:id, "record" fuer die Akte selbst. */
  schluessel: string;
  beschriftung: string;
};

export type Reiter = {
  schluessel: string;
  beschriftung: string;
  /** Die Seiten unter dem Reiter. Ein Klick auf den Reiter oeffnet die erste. */
  seiten: Seite[];
  /** Die Vorgaenge stehen unter diesem Reiter, als Verweise hinaus. */
  vorgaenge?: true;
};

export const REITER: Reiter[] = [
  { schluessel: "uebersicht", beschriftung: "Übersicht", seiten: [
    { schluessel: "record", beschriftung: "Übersicht" },
  ] },
  { schluessel: "objektdaten", beschriftung: "Objektdaten", seiten: [
    { schluessel: "objektdaten", beschriftung: "Basisdaten & Ausstattung" },
    { schluessel: "hoa-tenancy", beschriftung: "WEG & Miete" },
    { schluessel: "mandatory-data", beschriftung: "Pflichtangaben" },
  ] },
  { schluessel: "eigentum", beschriftung: "Eigentümer & Recht", seiten: [
    { schluessel: "eigentuemer", beschriftung: "Eigentümer" },
    { schluessel: "legal", beschriftung: "Recht & Lasten" },
    { schluessel: "disposition", beschriftung: "Verfügungsberechtigung" },
  ] },
  { schluessel: "preis", beschriftung: "Preis & Wert", seiten: [
    { schluessel: "pricing", beschriftung: "Preis & Wert" },
  ] },
  { schluessel: "unterlagen", beschriftung: "Unterlagen", seiten: [
    { schluessel: "document-requirements", beschriftung: "Unterlagenliste" },
    { schluessel: "documents", beschriftung: "Dokumente" },
  ] },
  { schluessel: "vermarktung", beschriftung: "Vermarktung", seiten: [
    { schluessel: "media", beschriftung: "Medien" },
    { schluessel: "exposes", beschriftung: "Exposés" },
    { schluessel: "marketing", beschriftung: "Portale" },
    { schluessel: "publication", beschriftung: "Website" },
  ] },
  { schluessel: "interessenten", beschriftung: "Interessenten", seiten: [
    { schluessel: "interests", beschriftung: "Interessenten & Besichtigungen" },
  ] },
  { schluessel: "abwicklung", beschriftung: "Abwicklung", vorgaenge: true, seiten: [
    { schluessel: "compliance", beschriftung: "Geldwäsche" },
  ] },
  { schluessel: "verlauf", beschriftung: "Verlauf", seiten: [
    { schluessel: "verlauf", beschriftung: "Verlauf" },
  ] },
];

/**
 * Die Teile der Seite routes/property-detail.tsx. Dieselbe Datei haengt in
 * app/routes.ts unter vier Adressen; welcher Teil gezeigt wird, sagt das
 * letzte Pfadstueck.
 */
export const TEILE = ["record", "objektdaten", "eigentuemer", "verlauf"] as const;
export type Teil = (typeof TEILE)[number];

export function teilAusPfad(pfad: string): Teil {
  const letztes = pfad.replace(/\/+$/, "").split("/").pop() ?? "";
  return (TEILE as readonly string[]).includes(letztes) ? (letztes as Teil) : "record";
}

/** Wohin ein Abschnitt der alten langen Seite jetzt gehoert -- fuer Umleitungen nach dem Speichern. */
const TEIL_JE_ANKER: Record<string, Teil> = {
  stammdaten: "objektdaten",
  adresse: "objektdaten",
  ausstattung: "objektdaten",
  eigentuemer: "eigentuemer",
  ueberblick: "record",
  checkliste: "record",
};

/** /properties/:id/<teil>#anker, passend zum Anker. "owner-..." gehoert zu den Eigentuemern. */
export function ankerPfad(propertyId: string, anker: string): string {
  const teil = anker.startsWith("owner-") ? "eigentuemer" : TEIL_JE_ANKER[anker] ?? "record";
  return `${abschnittsPfad(propertyId, teil)}#${anker}`;
}

/**
 * Die Vorgaenge zu dieser Immobilie. Das sind eigene Akten, nach der
 * Immobilie gefiltert -- deshalb stehen sie unter "Abwicklung" als Verweise
 * hinaus, mit Pfeil, und nie als Seite der Akte.
 */
export const VORGAENGE: { beschriftung: string; liste: string }[] = [
  { beschriftung: "Maklerauftrag", liste: "/mandates" },
  { beschriftung: "Aufmaß", liste: "/measurements" },
  { beschriftung: "Kaufangebote", liste: "/purchase-offers" },
  { beschriftung: "Reservierungen", liste: "/reservations" },
  { beschriftung: "Abschluss & Notar", liste: "/closings" },
  { beschriftung: "Provisionen", liste: "/commissions" },
];

/**
 * Seiten und Vorgaenge, die mehr als "property.read" verlangen (P1,
 * 15.10.2026). Wer das Recht nicht hat, sieht den Eintrag nicht -- vorher
 * stand er da und fuehrte auf "Keine Berechtigung" (403). Der Arbeitsplatz
 * prueft genau diese Rechte; die Ladeteile der Seiten pruefen weiter selbst.
 */
export const RECHT_JE_SEITE: Record<string, string> = {
  disposition: "disposition.read",
  "document-requirements": "document.read",
  documents: "document.read",
  compliance: "gwg.read",
};
export const RECHT_JE_VORGANG: Record<string, string> = {
  "/mandates": "mandate.read",
  "/measurements": "measurement.read",
  "/purchase-offers": "offer.read",
  "/reservations": "reservation.read",
  "/closings": "closing.read",
  "/commissions": "commission.read",
};
/** Alle Rechte, die der Arbeitsplatz fuer die Reiter pruefen muss. */
export const REITER_RECHTE = [...new Set([...Object.values(RECHT_JE_SEITE), ...Object.values(RECHT_JE_VORGANG)])];

/** Alle Seitenschluessel ausser "record" -- die Unterpfade der Akte. */
export const UNTERPFADE = REITER.flatMap((r) => r.seiten.map((x) => x.schluessel)).filter((x) => x !== "record");

/**
 * Erkennt /properties/:id und, wenn vorhanden, die Seite darin.
 * Aus der Liste gebaut, damit es keine zweite Aufzaehlung gibt.
 */
export function objektakteAusPfad(pfad: string): { propertyId: string; seite: string } | null {
  const muster = new RegExp(`^/properties/([^/]+)(?:/(${UNTERPFADE.join("|")})(?:/.*)?)?/?$`);
  const treffer = muster.exec(pfad);
  if (!treffer) return null;
  return { propertyId: treffer[1], seite: treffer[2] ?? "record" };
}

/** Der Pfad eines Abschnitts. */
export function abschnittsPfad(propertyId: string, schluessel: string): string {
  const id = encodeURIComponent(propertyId);
  return schluessel === "record" ? `/properties/${id}` : `/properties/${id}/${schluessel}`;
}

/** Der Pfad eines Vorgangs, auf diese Immobilie gefiltert. */
export function vorgangsPfad(propertyId: string, liste: string): string {
  return `${liste}?property_id=${encodeURIComponent(propertyId)}`;
}
