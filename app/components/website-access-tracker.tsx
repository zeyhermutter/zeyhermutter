import { useEffect } from "react";
import { useLocation } from "react-router";
import { istOeffentlicherWebsitePfad } from "~/lib/website-zugriff";

const SESSION_KEY = "zm_website_besuch_v1";

function sitzungskennung() {
  try {
    let value = sessionStorage.getItem(SESSION_KEY);
    if (!value) {
      value = crypto.randomUUID();
      sessionStorage.setItem(SESSION_KEY, value);
    }
    return value;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Datensparsame Reichweitenmessung fuer die oeffentliche Website.
 * Die Kennung lebt nur im aktuellen Browser-Tab. Der Server speichert davon
 * nur einen SHA-256-Wert; IP, User-Agent, Referrer und Query-Strings werden
 * absichtlich nicht uebermittelt.
 */
export function WebsiteAccessTracker() {
  const location = useLocation();

  useEffect(() => {
    if (!istOeffentlicherWebsitePfad(location.pathname)) return;
    const visitor = sitzungskennung();
    void fetch("/api/website-zugriff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ path: location.pathname, visitor }),
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {
      // Statistik darf niemals den Seitenbesuch stoeren.
    });
  }, [location.pathname]);

  return null;
}
