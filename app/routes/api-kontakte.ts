import { data } from "react-router";
import { requirePermission } from "~/lib/auth.server";

// Kontakte fuer ein Auswahlfeld suchen (14.10.2026).
//
// WARUM
//
// Auswahlfelder luden bisher alle Kontakte vorab -- die Eigentuemer-Auswahl
// 1000, die Beziehungen am Kontakt 250. Wer dahinter lag, liess sich nicht
// waehlen, und niemand merkte es. Jetzt sucht das Feld beim Tippen in der
// Datenbank, ueber dieselbe Funktion wie die globale Suche (Name, Nummer,
// E-Mail, Telefon, Anschrift). Gelesen wird mit den Rechten des Benutzers.

const HOECHSTENS = 20;

export async function loader({ request, context }: any) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "contact.read");
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return data({ treffer: [] }, { headers: responseHeaders() });
  const { data: zeilen, error } = await supabase
    .rpc("crm_global_search", { p_query: q, p_include_archived: false })
    .eq("entity_type", "CONTACT")
    .limit(HOECHSTENS);
  if (error) return data({ treffer: [], fehler: "Suche nicht möglich." }, { status: 500, headers: responseHeaders() });
  const treffer = ((zeilen ?? []) as any[]).map((z) => ({
    id: z.entity_id as string,
    name: z.title as string,
    nummer: z.reference as string,
    zusatz: z.subtitle && z.subtitle !== "—" ? (z.subtitle as string) : null,
  }));
  const kopf = new Headers(responseHeaders());
  kopf.set("Cache-Control", "private, no-store");
  return data({ treffer }, { headers: kopf });
}
