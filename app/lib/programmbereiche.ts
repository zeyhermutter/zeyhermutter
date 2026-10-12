// Die Bereiche des Programms -- an einer Stelle.
//
// WARUM ES DIESE DATEI GIBT
//
// Links stand bis zum 12.10.2026 ein Seitenstreifen mit 31 Eintraegen in
// sieben Gruppen, alle gleich gross, alle gleichzeitig sichtbar -- auch was
// man einmal im Quartal braucht. Sebastian: "Fuer mich ist das sehr
// unuebersichtlich alles ... eher wie ein PC-Programm aufbauen und nicht wie
// eine Webseite."
//
// Eine Maklersoftware hat wenige Hauptbereiche, und erst innerhalb eines
// Bereichs stehen dessen Unterpunkte. Hier sind es sechs, dazu die
// Verwaltung fuer das Seltene. Kein Eintrag faellt weg: jeder der 31 alten
// Eintraege ist ein Unterpunkt in genau einem Bereich.
// scripts/check-programmbereiche.mjs haelt das zu.
//
// Wer eine neue Liste anlegt, traegt sie hier ein -- sonst ist sie nur ueber
// die Adresszeile erreichbar.

export type Bereichsschluessel =
  | "tag" | "adressen" | "immobilien" | "vermarktung" | "abschluss" | "auswertung" | "verwaltung";

export type Unterpunkt = {
  beschriftung: string;
  pfad: string;
  /** Nur genau dieser Pfad, nicht seine Unterseiten. Fuer /crm, das sonst alles fressen wuerde. */
  genau?: boolean;
};

export type Bereich = {
  schluessel: Bereichsschluessel;
  beschriftung: string;
  /** Wohin ein Klick auf den Bereich fuehrt. */
  start: string;
  unterpunkte: Unterpunkt[];
  /**
   * Pfade, die zum Bereich gehoeren, ohne eigener Unterpunkt zu sein --
   * Detailseiten, deren Liste fehlt oder woanders steht.
   */
  weitere?: string[];
};

/** In der Reihenfolge der Modulleiste. Die Verwaltung steht unten abgesetzt. */
export const BEREICHE: Bereich[] = [
  {
    schluessel: "tag",
    beschriftung: "Mein Tag",
    start: "/crm",
    unterpunkte: [
      { beschriftung: "Heute", pfad: "/crm", genau: true },
      // "In Bewegung" stand in keinem Menue, nur als Knopf auf der Uebersicht.
      // Aufgefallen beim Abgleich aller Listen mit den Bereichen.
      { beschriftung: "In Bewegung", pfad: "/pipeline" },
      { beschriftung: "Aufgaben", pfad: "/crm/tasks" },
      { beschriftung: "Kalender", pfad: "/crm/calendar" },
      { beschriftung: "E-Mail", pfad: "/crm/email" },
      { beschriftung: "Benachrichtigungen", pfad: "/crm/notifications" },
      { beschriftung: "Suche", pfad: "/crm/search" },
    ],
  },
  {
    schluessel: "adressen",
    beschriftung: "Adressen",
    start: "/crm/contacts",
    unterpunkte: [
      // Seit dem 12.10.2026 mit eigener Liste. Vorher standen Kontakte nur
      // auf der Uebersicht, die 25 zuletzt geaenderten.
      { beschriftung: "Kontakte", pfad: "/crm/contacts" },
      { beschriftung: "Verkäufer-Leads", pfad: "/leads" },
      { beschriftung: "Verkaufsstrategie-Check", pfad: "/crm/sales-readiness" },
      { beschriftung: "Suchprofile", pfad: "/search-profiles" },
      { beschriftung: "Organisationen", pfad: "/crm/organizations" },
    ],
  },
  {
    schluessel: "immobilien",
    beschriftung: "Immobilien",
    start: "/properties",
    unterpunkte: [
      { beschriftung: "Objekte", pfad: "/properties" },
      { beschriftung: "Makleraufträge", pfad: "/mandates" },
      { beschriftung: "Verkaufsprojekte", pfad: "/projects" },
      { beschriftung: "Aufmaß-Aufträge", pfad: "/measurements" },
    ],
  },
  {
    schluessel: "vermarktung",
    beschriftung: "Vermarktung",
    start: "/inquiries",
    unterpunkte: [
      { beschriftung: "Anfragen", pfad: "/inquiries" },
      { beschriftung: "Besichtigungen", pfad: "/viewings" },
      { beschriftung: "Kampagnen & Gebiete", pfad: "/acquisition" },
      { beschriftung: "Website", pfad: "/crm/website" },
    ],
  },
  {
    schluessel: "abschluss",
    beschriftung: "Abschluss",
    start: "/purchase-offers",
    unterpunkte: [
      { beschriftung: "Kaufangebote", pfad: "/purchase-offers" },
      { beschriftung: "Reservierungen", pfad: "/reservations" },
      { beschriftung: "Abschlüsse & Notar", pfad: "/closings" },
      { beschriftung: "Provisionen", pfad: "/commissions" },
    ],
  },
  {
    schluessel: "auswertung",
    beschriftung: "Auswertung",
    start: "/reports",
    unterpunkte: [
      { beschriftung: "Dashboard", pfad: "/reports" },
      { beschriftung: "Nachbetreuung", pfad: "/after-sales" },
      { beschriftung: "Empfehlungen", pfad: "/referrals" },
      { beschriftung: "Case Studies", pfad: "/case-studies" },
    ],
  },
  {
    schluessel: "verwaltung",
    beschriftung: "Verwaltung",
    start: "/crm/hilfe",
    unterpunkte: [
      { beschriftung: "Anleitung", pfad: "/crm/hilfe" },
      { beschriftung: "Geldwäsche & Aufbewahrung", pfad: "/compliance" },
      { beschriftung: "Benutzer & Rollen", pfad: "/crm/users" },
      { beschriftung: "Weiterbildung", pfad: "/crm/training" },
      { beschriftung: "Archiv", pfad: "/crm/archive" },
      { beschriftung: "Systemhistorie", pfad: "/crm/history" },
    ],
  },
];

function passt(pfad: string, muster: string, genau?: boolean) {
  if (genau) return pfad === muster;
  return pfad === muster || pfad.startsWith(`${muster}/`);
}

/**
 * Bereich und Unterpunkt zu einem Pfad. Der laengste passende Pfad gewinnt:
 * /crm/tasks gehoert zu "Aufgaben", nicht zur Uebersicht /crm.
 *
 * Ohne Treffer ist "Mein Tag" aktiv -- lieber ein markierter Startbereich
 * als eine Leiste, in der nichts ausgewaehlt ist.
 */
export function bereichAusPfad(pfad: string): { bereich: Bereich; unterpunkt: Unterpunkt | null } {
  let bester: { bereich: Bereich; unterpunkt: Unterpunkt | null; laenge: number } | null = null;
  for (const bereich of BEREICHE) {
    for (const unterpunkt of bereich.unterpunkte) {
      if (passt(pfad, unterpunkt.pfad, unterpunkt.genau) && (!bester || unterpunkt.pfad.length > bester.laenge)) {
        bester = { bereich, unterpunkt, laenge: unterpunkt.pfad.length };
      }
    }
    for (const weiterer of bereich.weitere ?? []) {
      if (passt(pfad, weiterer) && (!bester || weiterer.length > bester.laenge)) {
        bester = { bereich, unterpunkt: null, laenge: weiterer.length };
      }
    }
  }
  // Der Verkaufsstrategie-Check eines Leads liegt unter /leads/:id/, gehoert
  // aber zum Unterpunkt "Verkaufsstrategie-Check" -- so markierte ihn schon
  // der alte Seitenstreifen.
  if (/^\/leads\/[^/]+\/sales-readiness(?:\/|$)/.test(pfad)) {
    const bereich = BEREICHE.find((b) => b.schluessel === "adressen")!;
    return { bereich, unterpunkt: bereich.unterpunkte.find((u) => u.pfad === "/crm/sales-readiness") ?? null };
  }
  return bester ?? { bereich: BEREICHE[0], unterpunkt: null };
}

/**
 * Das E-Mail-Fenster mit dem Kontakt, Lead oder der Anfrage vorbelegt, auf
 * deren Seite man gerade steht. Stand vorher im Seitenstreifen und geht
 * beim Umbau nicht verloren.
 */
export function emailZiel(pfad: string): string {
  const kontakt = pfad.match(/^\/crm\/contacts\/([0-9a-f-]{36})(?:\/|$)/i);
  if (kontakt) return `/crm/email?contact_id=${encodeURIComponent(kontakt[1])}`;
  const lead = pfad.match(/^\/leads\/([0-9a-f-]{36})(?:\/|$)/i);
  if (lead) return `/crm/email?lead_id=${encodeURIComponent(lead[1])}`;
  const anfrage = pfad.match(/^\/inquiries\/([0-9a-f-]{36})(?:\/|$)/i);
  if (anfrage) return `/crm/email?inquiry_id=${encodeURIComponent(anfrage[1])}`;
  return "/crm/email";
}
