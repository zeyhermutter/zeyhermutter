const GENAUE_WEBSITE_PFADE = new Set([
  "/",
  "/verkaufsfertig-check",
  "/immobilien",
  "/ratgeber",
  "/ueber-uns",
  "/ohne-makler-verkaufen",
  "/bewertung",
  "/suchauftrag",
  "/technisches-aufmass",
  "/referenzen",
  "/kontakt",
  "/impressum",
  "/datenschutz",
  "/widerruf",
]);

const WEBSITE_PREFIXE = ["/immobilien/", "/ratgeber/"];

export function istOeffentlicherWebsitePfad(pathname: string) {
  if (GENAUE_WEBSITE_PFADE.has(pathname)) return true;
  return WEBSITE_PREFIXE.some((prefix) => pathname.startsWith(prefix));
}
