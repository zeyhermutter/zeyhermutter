import { data } from "react-router";
import { kontaktName } from "~/lib/kontakt-name";
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
  const url = new URL(request.url);
  const kopf = new Headers(responseHeaders());
  kopf.set("Cache-Control", "private, no-store");

  // Einen bereits gewaehlten Kontakt beschriften (?id=...). Das Feld kennt
  // beim Laden nur die Kennung; Name und Nummer holt es hier.
  const id = url.searchParams.get("id") ?? "";
  if (id) {
    if (!/^[0-9a-f-]{36}$/i.test(id)) return data({ treffer: [] }, { status: 400, headers: kopf });
    const { data: k, error } = await supabase.from("contacts").select("id,contact_number,first_name,last_name").eq("id", id).maybeSingle();
    if (error) return data({ treffer: [], fehler: "Kontakt nicht lesbar." }, { status: 500, headers: kopf });
    const treffer = k ? [{ id: k.id as string, name: kontaktName(k), nummer: k.contact_number as string, zusatz: null }] : [];
    return data({ treffer }, { headers: kopf });
  }

  const q = (url.searchParams.get("q") ?? "").trim().slice(0, 80);
  if (q.length < 2) return data({ treffer: [] }, { headers: kopf });
  const { data: zeilen, error } = await supabase
    .rpc("crm_global_search", { p_query: q, p_include_archived: false })
    .eq("entity_type", "CONTACT")
    .limit(HOECHSTENS);
  if (error) return data({ treffer: [], fehler: "Suche nicht möglich." }, { status: 500, headers: kopf });
  const treffer = ((zeilen ?? []) as any[]).map((z) => ({
    id: z.entity_id as string,
    name: z.title as string,
    nummer: z.reference as string,
    zusatz: z.subtitle && z.subtitle !== "—" ? (z.subtitle as string) : null,
  }));
  return data({ treffer }, { headers: kopf });
}
