import { WEBSITE_PAGE_DEFINITIONS, type WebsitePageKey } from "~/lib/website-content";

// Welche Seiten oeffentlich sind -- an einer Stelle, nicht in jeder Datei neu.
//
// WARUM ES DIESE DATEI GIBT
//
// Die Sitemap trug vier von Hand getippte Pfade: "/", "/verkaufsfertig-check",
// "/immobilien", "/kontakt". Dazwischen sind elf oeffentliche Seiten entstanden
// -- Bewertung, Suchauftrag, Referenzen, Ueber uns, Widerruf, Ohne Makler
// verkaufen, der Ratgeber und seine vier Anlassseiten. Keine davon stand darin.
// Suchmaschinen bekamen also genau die Seiten nicht genannt, wegen derer
// jemand sucht.
//
// Dasselbe bei robots.txt: die Liste der internen Bereiche war bei "/crm",
// "/leads", "/properties" stehengeblieben, waehrend "/mandates", "/closings",
// "/commissions" und ein Dutzend weitere dazugekommen sind.
//
// Beides ist derselbe Fehler: eine Liste, die jemand beim Anlegen einer Route
// von Hand nachziehen muss. scripts/check-sitemap.mjs vergleicht die Listen
// hier bei jedem Build mit app/routes.ts und faellt, sobald eine Route
// auftaucht, die in keiner davon vorkommt. Neue oeffentliche Seiten koennen
// damit nicht mehr stillschweigend aus der Sitemap fallen.

/**
 * Oeffentliche Seiten, deren Inhalt fest im Code steht.
 * Die uebrigen kommen aus WEBSITE_PAGE_DEFINITIONS und damit aus dem CMS.
 */
export const SEITEN_OHNE_CMS = [
  "/verkaufsfertig-check",
  "/immobilien",
  "/bewertung",
  "/suchauftrag",
  "/referenzen",
] as const;

/**
 * Seiten, deren hinterlegter Text ausdruecklich noch fehlt.
 *
 * Sie sind gebaut und erreichbar, sagen aber selbst, dass der Inhalt fehlt:
 * eine Widerrufsbelehrung ist ein Rechtstext, und was auf "Ueber uns" steht,
 * weiss nur das Unternehmen. Solange keine im CMS veroeffentlichte Fassung
 * vorliegt, gehoeren sie weder in die Sitemap noch in den Index -- eine Seite
 * "hier fehlt noch der Text" bei Google ist schlechter als keine Seite.
 *
 * Sobald im CMS eine Fassung veroeffentlicht ist, faellt die Ausnahme von
 * selbst weg. Niemand muss daran denken.
 */
export const SEITEN_OHNE_HINTERLEGTEN_TEXT: WebsitePageKey[] = ["ABOUT", "WITHDRAWAL"];

/**
 * Oeffentlich erreichbar, aber bewusst nicht in der Sitemap -- jeweils mit Grund.
 * Der Grund ist Pflicht: eine Ausnahme ohne Begruendung ist ein Versehen.
 */
export const NICHT_IN_DIE_SITEMAP: Record<string, string> = {
  "/robots.txt": "Anweisungsdatei fuer Suchmaschinen, keine Seite",
  "/favicon.svg": "Symbol, keine Seite",
  "/sitemap.xml": "die Sitemap selbst",
  "/homepage-varianten": "Entwurfsgalerie fuer die Abstimmung, traegt noindex",
  "/homepage-varianten/7": "Entwurfsgalerie fuer die Abstimmung, traegt noindex",
  "/homepage-varianten/:variant": "Entwurfsgalerie fuer die Abstimmung, traegt noindex",
  "/immobilien/medien/:mediaId/:version": "Bilddateien, keine Seiten",
  "/immobilien/:slug": "aus der Datenbank ergaenzt, siehe app/routes/sitemap.ts",
  "/ratgeber/:thema": "die vier Anlassseiten stehen einzeln in WEBSITE_PAGE_DEFINITIONS",
  "/login": "interner Zugang",
  "/logout": "interner Zugang",
  "/__preview/sales-readiness": "interne Vorschau",
  "/api/sales-readiness-ai": "Schnittstelle, keine Seite",
  "/api/geocode-address": "Schnittstelle, keine Seite",
};

/**
 * Die obersten Pfadabschnitte des internen Bereichs.
 * robots.txt sperrt sie; scripts/check-sitemap.mjs prueft, dass keiner fehlt.
 */
export const INTERNE_PRAEFIXE = [
  "/acquisition", "/after-sales", "/case-studies", "/closings", "/commissions",
  "/compliance", "/crm", "/inquiries", "/leads", "/mandates", "/projects",
  "/properties", "/purchase-offers", "/referrals", "/reports", "/reservations",
  "/search-profiles", "/viewings",
];

/** Weitere Pfade, die robots.txt sperrt, ohne zum internen Bereich zu gehoeren. */
export const WEITERE_GESPERRTE_PFADE = ["/api/", "/login", "/logout", "/homepage-varianten", "/__preview"];

/**
 * Alle Pfade, die in die Sitemap gehoeren -- ohne die Objektseiten, die aus der
 * Datenbank kommen.
 *
 * @param veroeffentlicht Die CMS-Seiten, von denen eine oeffentliche Fassung vorliegt.
 */
export function sitemapPfade(veroeffentlicht: ReadonlySet<string>): string[] {
  const pfade = new Set<string>(["/"]);
  for (const pfad of SEITEN_OHNE_CMS) pfade.add(pfad);
  for (const [schluessel, definition] of Object.entries(WEBSITE_PAGE_DEFINITIONS)) {
    if (SEITEN_OHNE_HINTERLEGTEN_TEXT.includes(schluessel as WebsitePageKey)
        && !veroeffentlicht.has(schluessel)) continue;
    pfade.add(definition.path);
  }
  return [...pfade].sort((a, b) => (a === "/" ? -1 : b === "/" ? 1 : a.localeCompare(b, "de")));
}
