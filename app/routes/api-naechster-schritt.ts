import { data } from "react-router";
import { requireActiveUser } from "~/lib/auth.server";
import { crmToday } from "~/lib/local-time";
import { AMPEL_ARTEN, type AmpelArt } from "~/lib/naechster-schritt";
import { ladeSchritte } from "~/lib/vorgang-stand.server";

// Die Ampel einer Liste (P2-1, 16.10.2026): GET /api/naechster-schritt?art=lead
//
// Eigene Anfrage, damit die Unteranfragen nicht zu denen des Arbeitsplatzes
// zaehlen (siehe app/lib/vorgang-stand.server.ts). Gelesen wird mit den
// Rechten des Benutzers; was er nicht sehen darf, kommt nicht zurueck.

export async function loader({ request, context }: any) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const art = new URL(request.url).searchParams.get("art") as AmpelArt | null;
  const kopf = new Headers(responseHeaders());
  kopf.set("Cache-Control", "private, no-store");
  if (!art || !AMPEL_ARTEN.includes(art)) return data({ staende: {}, vollstaendig: false }, { status: 400, headers: kopf });
  return data(await ladeSchritte(supabase, art, crmToday()), { headers: kopf });
}
