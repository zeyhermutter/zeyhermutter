// "Zuletzt geöffnet" (20.10.2026, onOffice-Abgleich).
//
// Jede Akte im Arbeitsplatz merkt sich beim Oeffnen (ArbeitsplatzKopf):
// Nummer, Titel und Pfad der Akte. Strg+K zeigt ohne Suchbegriff die letzten
// acht. Gespeichert im Browser (localStorage), nicht in der Datenbank -- also
// je Geraet; beim Abmelden wird die Liste geloescht.

export type ZuletztEintrag = { pfad: string; art: string; nummer: string; titel: string; zeit: number };

const SCHLUESSEL = "zm-zuletzt-geoeffnet";
const ANZAHL = 8;

const ARTEN: [RegExp, string][] = [
  [/^\/properties\//, "Immobilie"], [/^\/crm\/contacts\//, "Kontakt"], [/^\/crm\/organizations\//, "Organisation"],
  [/^\/leads\//, "Lead"], [/^\/inquiries\//, "Anfrage"], [/^\/viewings\//, "Besichtigung"], [/^\/search-profiles\//, "Suchprofil"],
  [/^\/mandates\//, "Maklerauftrag"], [/^\/projects\//, "Verkaufsprojekt"], [/^\/measurements\//, "Aufmaß"],
  [/^\/purchase-offers\//, "Kaufangebot"], [/^\/reservations\//, "Reservierung"], [/^\/closings\//, "Abschluss"],
  [/^\/commissions\//, "Provision"], [/^\/referrals\//, "Empfehlung"], [/^\/case-studies\//, "Case Study"],
  [/^\/acquisition\//, "Kampagne"], [/^\/crm\/website\//, "Website"],
];

/** Der Pfad der Akte selbst, ohne Reiter: alles bis einschliesslich der Kennung. */
export function aktenPfad(pathname: string): string | null {
  const m = pathname.match(/^(.*?\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i)
    ?? pathname.match(/^(\/crm\/website\/[a-z0-9-]+)(?:\/|$)/i);
  return m ? m[1] : null;
}

export function leseZuletzt(): ZuletztEintrag[] {
  try {
    const roh = JSON.parse(window.localStorage.getItem(SCHLUESSEL) ?? "[]");
    return Array.isArray(roh) ? roh.filter((e) => e && typeof e.pfad === "string" && typeof e.titel === "string").slice(0, ANZAHL) : [];
  } catch { return []; }
}

export function merkeZuletzt(pathname: string, nummer: string, titel: string) {
  const pfad = aktenPfad(pathname);
  if (!pfad || !titel) return;
  const art = ARTEN.find(([re]) => re.test(pfad))?.[1] ?? "Akte";
  try {
    const liste = [{ pfad, art, nummer, titel, zeit: Date.now() }, ...leseZuletzt().filter((e) => e.pfad !== pfad)].slice(0, ANZAHL);
    window.localStorage.setItem(SCHLUESSEL, JSON.stringify(liste));
  } catch { /* Speicher gesperrt (privates Fenster) -- dann eben ohne Liste */ }
}

export function vergissZuletzt() {
  try { window.localStorage.removeItem(SCHLUESSEL); } catch { /* egal */ }
}
