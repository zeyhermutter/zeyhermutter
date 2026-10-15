import { data } from "react-router";
import { requirePermission } from "~/lib/auth.server";
import { REITER_RECHTE } from "~/lib/objektakte-navigation";

// Welche Reiter der Objektakte darf der Benutzer oeffnen? (P1, 15.10.2026)
//
// WARUM EIGENE ADRESSE
//
// Zuerst prueften der Immobilien-Arbeitsplatz die neun Rechte selbst. Alle
// Ladeteile einer Seite laufen aber in einer Anfrage, und ein Worker darf je
// Anfrage nur eine begrenzte Zahl Unteranfragen stellen. Die Objektakte lag
// schon nahe an der Grenze: mit den neun Abfragen fielen auf BETA der
// Objektverlauf ("keine Änderung aufgezeichnet") und ein Teil von "auf einen
// Blick" aus. Die Reiter holen die Rechte deshalb hier, in einer eigenen
// Anfrage, nachdem die Seite steht.

export async function loader({ request, context }: any) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "property.read");
  const ergebnisse = await Promise.all(REITER_RECHTE.map(async (recht) => {
    const { data: ja, error } = await supabase.rpc("current_user_has_permission", { p_permission: recht });
    // Kann ein Recht nicht geprueft werden, bleibt der Eintrag sichtbar; die Seite prueft selbst.
    return error || ja === true ? recht : null;
  }));
  const kopf = new Headers(responseHeaders());
  kopf.set("Cache-Control", "private, no-store");
  return data({ rechte: ergebnisse.filter((r): r is string => r !== null) }, { headers: kopf });
}
