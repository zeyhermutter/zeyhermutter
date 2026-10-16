// Naechster Schritt je Datensatz: die Ampel (P2-1, 16.10.2026).
//
// WARUM
//
// In den Listen sah man nicht, wo Arbeit wartet. Ein Lead ohne Wiedervorlage,
// eine Anfrage ohne Aufgabe, ein Objekt in der Vermarktung ohne Termin --
// alle sahen gleich aus wie die, an denen gerade gearbeitet wird. Vorbild ist
// Pipedrive: jede Zeile zeigt, ob und wann der naechste Schritt ansteht.
//
//   rot    ueberfaellig       der frueheste offene Schritt liegt vor heute
//   gruen  heute              er ist heute faellig
//   grau   geplant            er liegt in der Zukunft
//   gelb   kein Schritt       ein laufender Vorgang hat keinen geplanten Schritt
//
// Die Farbe ist nie das einzige Merkmal: Jede Ampel traegt ein Zeichen und
// einen Text ("Überfällig · 12.10."), lesbar auch ohne Farbsehen und fuer
// Bildschirmleser.
//
// WAS ALS SCHRITT ZAEHLT
//
// Offene Aufgaben (offen, in Arbeit), geplante und bestaetigte
// Besichtigungen, die Wiedervorlage eines Leads, der naechste Schritt und die
// Wiedervorlage eines Verkaufsprojekts. Eine vergangene Besichtigung, die
// noch "geplant" ist, ist ueberfaellig: dort fehlt das Ergebnis.

export type Ampel = "ueberfaellig" | "heute" | "geplant" | "ohne";

export type Schrittstand = { stand: Ampel; /** "YYYY-MM-DD" oder null */ tag: string | null };

/** Die Bereiche mit Ampel. */
export const AMPEL_ARTEN = ["contact", "property", "lead", "inquiry", "project"] as const;
export type AmpelArt = (typeof AMPEL_ARTEN)[number];

export const AMPEL_TEXT: Record<Ampel, string> = {
  ueberfaellig: "Überfällig",
  heute: "Heute",
  geplant: "Geplant",
  ohne: "Kein nächster Schritt",
};

/** Ein Zeichen je Stand, damit die Farbe nicht allein traegt. */
export const AMPEL_ZEICHEN: Record<Ampel, string> = {
  ueberfaellig: "!",
  heute: "●",
  geplant: "○",
  ohne: "–",
};

/** Aus den Faelligkeitstagen eines Datensatzes (YYYY-MM-DD) den Stand. */
export function standAus(tage: Array<string | null | undefined>, heute: string): Schrittstand | null {
  const bekannt = tage.filter((t): t is string => Boolean(t)).sort();
  if (bekannt.length === 0) return null;
  const erster = bekannt[0];
  return { stand: erster < heute ? "ueberfaellig" : erster === heute ? "heute" : "geplant", tag: erster };
}
