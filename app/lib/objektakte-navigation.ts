// Die Navigation der Objektakte -- an einer Stelle.
//
// WARUM ES DIESE DATEI GIBT
//
// In der Leiste ueber der Objektakte standen 19 Links in einer Zeile, ohne
// Rangfolge. Das ist der Bildschirm, auf dem ein Makler den halben Tag
// verbringt, und von den 19 braucht er im Alltag fuenf.
//
// Schlimmer als die Zahl war die Vermischung: die ersten 14 sind Abschnitte
// DIESER Akte, die letzten 5 sind ANDERE Akten, nach dieser Immobilie
// gefiltert -- Maklerauftrag, Kaufangebote, Reservierungen, Abschluss,
// Provisionen. Optisch nicht zu unterscheiden. Wer auf "Provisionen" klickte,
// verliess die Objektakte, ohne dass die Leiste das andeutete.
//
// Jetzt sind es zwei Zeilen, und die Abschnittszeile zeigt, was zur Phase der
// Immobilie gehoert. Der Rest steht hinter einem sichtbaren Zaehler -- nicht
// versteckt, nur einen Klick entfernt.
//
// Die Liste stand frueher als Markup in routes/internal-layout.tsx, und die
// Regex, die den aktiven Abschnitt erkennt, zaehlte dieselben Namen ein
// zweites Mal auf. Zwei Listen fuer dieselbe Sache: wer einen Abschnitt
// anlegt und nur eine pflegt, bekommt eine Seite ohne Markierung oder einen
// Link ins Leere. scripts/check-objektakte-navigation.mjs haelt das zu.

import type { Beschriftungen } from "~/lib/labels";

/** Die Phasen einer Immobilie, grober als der Status. */
export type Phase = "VORBEREITUNG" | "VERMARKTUNG" | "ABWICKLUNG" | "ABGESCHLOSSEN";

/**
 * Status -> Phase. Jeder Wert aus IMMOBILIENSTATUS kommt genau einmal vor;
 * die Pruefung vergleicht beide Listen.
 */
export const PHASE_JE_STATUS: Record<string, Phase> = {
  DRAFT: "VORBEREITUNG",
  ACQUISITION: "VORBEREITUNG",
  VALUATION: "VORBEREITUNG",
  CONTRACT_PENDING: "VORBEREITUNG",
  PREPARATION: "VORBEREITUNG",
  MARKETING: "VERMARKTUNG",
  RESERVED: "ABWICKLUNG",
  NOTARY: "ABWICKLUNG",
  SOLD: "ABGESCHLOSSEN",
  LOST: "ABGESCHLOSSEN",
  WITHDRAWN: "ABGESCHLOSSEN",
  ARCHIVED: "ABGESCHLOSSEN",
};

export type Abschnitt = {
  /** Letztes Pfadstueck unter /properties/:id, "record" fuer die Akte selbst. */
  schluessel: string;
  beschriftung: string;
  /** In welchen Phasen der Abschnitt vorn steht. "immer" heisst: in jeder. */
  phasen: Phase[] | "immer";
};

/**
 * Die Abschnitte der Akte, in der Reihenfolge, in der sie angezeigt werden.
 *
 * Die Reihenfolge folgt dem Ablauf: was die Immobilie verkaufsfaehig macht,
 * dann die Vermarktung, dann die Nachweise. "Objektakte" und "Dokumente"
 * stehen in jeder Phase -- die eine ist der Einstieg, die andere braucht man
 * zu jedem Zeitpunkt.
 */
export const AKTE_ABSCHNITTE: Abschnitt[] = [
  { schluessel: "record", beschriftung: "Objektakte", phasen: "immer" },
  { schluessel: "legal", beschriftung: "Recht & Lasten", phasen: ["VORBEREITUNG"] },
  { schluessel: "disposition", beschriftung: "Verfügungsberechtigung", phasen: ["VORBEREITUNG"] },
  { schluessel: "pricing", beschriftung: "Preis & Wert", phasen: ["VORBEREITUNG", "VERMARKTUNG", "ABWICKLUNG"] },
  { schluessel: "hoa-tenancy", beschriftung: "WEG & Miete", phasen: ["VORBEREITUNG"] },
  { schluessel: "mandatory-data", beschriftung: "Pflichtangaben", phasen: ["VORBEREITUNG"] },
  { schluessel: "document-requirements", beschriftung: "Unterlagenliste", phasen: ["VORBEREITUNG", "VERMARKTUNG", "ABWICKLUNG"] },
  { schluessel: "media", beschriftung: "Medien", phasen: ["VORBEREITUNG", "VERMARKTUNG"] },
  { schluessel: "exposes", beschriftung: "Exposés", phasen: ["VERMARKTUNG"] },
  { schluessel: "marketing", beschriftung: "Vermarktung & Portale", phasen: ["VERMARKTUNG"] },
  { schluessel: "publication", beschriftung: "Website", phasen: ["VERMARKTUNG"] },
  { schluessel: "interests", beschriftung: "Interessenten & Besichtigungen", phasen: ["VERMARKTUNG", "ABWICKLUNG"] },
  { schluessel: "compliance", beschriftung: "Geldwäsche", phasen: ["ABWICKLUNG"] },
  { schluessel: "documents", beschriftung: "Dokumente", phasen: "immer" },
];

/**
 * Die Vorgaenge zu dieser Immobilie. Das sind eigene Akten, nach der
 * Immobilie gefiltert -- deshalb stehen sie in einer eigenen Zeile und tragen
 * einen Pfeil. Sie haengen nicht an der Phase: ein Maklerauftrag kann in
 * jedem Zustand nachgeschlagen werden.
 */
export const VORGAENGE: { beschriftung: string; liste: string }[] = [
  { beschriftung: "Maklerauftrag", liste: "/mandates" },
  { beschriftung: "Aufmaß", liste: "/measurements" },
  { beschriftung: "Kaufangebote", liste: "/purchase-offers" },
  { beschriftung: "Reservierungen", liste: "/reservations" },
  { beschriftung: "Abschluss & Notar", liste: "/closings" },
  { beschriftung: "Provisionen", liste: "/commissions" },
];

/** Die Abschnittsschluessel ausser "record" -- die Unterpfade der Akte. */
export const UNTERPFADE = AKTE_ABSCHNITTE
  .map((a) => a.schluessel)
  .filter((s) => s !== "record");

/**
 * Erkennt /properties/:id und, wenn vorhanden, den Abschnitt darin.
 * Aus der Liste gebaut, damit es keine zweite Aufzaehlung gibt.
 */
export function objektakteAusPfad(pfad: string): { propertyId: string; abschnitt: string } | null {
  const muster = new RegExp(`^/properties/([^/]+)(?:/(${UNTERPFADE.join("|")})(?:/.*)?)?/?$`);
  const treffer = muster.exec(pfad);
  if (!treffer) return null;
  return { propertyId: treffer[1], abschnitt: treffer[2] ?? "record" };
}

/**
 * Welche Abschnitte in dieser Phase vorn stehen, und welche dahinter.
 *
 * Ohne bekannten Status wird nichts gefaltet: lieber eine volle Leiste als
 * eine, die den gesuchten Abschnitt grundlos wegraeumt.
 */
export function abschnitteFuerStatus(status: string | null | undefined): {
  vorn: Abschnitt[];
  dahinter: Abschnitt[];
} {
  const phase = status ? PHASE_JE_STATUS[status] : undefined;
  if (!phase) return { vorn: AKTE_ABSCHNITTE, dahinter: [] };

  const vorn: Abschnitt[] = [];
  const dahinter: Abschnitt[] = [];
  for (const abschnitt of AKTE_ABSCHNITTE) {
    const gehoertDazu = abschnitt.phasen === "immer" || abschnitt.phasen.includes(phase);
    (gehoertDazu ? vorn : dahinter).push(abschnitt);
  }
  return { vorn, dahinter };
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

/** Nur fuer die Pruefung: die Beschriftungen, damit sie gegen labels.ts kann. */
export type { Beschriftungen };
