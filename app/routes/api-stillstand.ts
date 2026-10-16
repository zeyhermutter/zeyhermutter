import { data } from "react-router";
import { requireActiveUser } from "~/lib/auth.server";
import { crmToday } from "~/lib/local-time";
import { ladeStillstand } from "~/lib/vorgang-stand.server";

// "Stillstand" in Mein Tag (P2-1, 16.10.2026): GET /api/stillstand?scope=all
// oder ?von=<Benutzer>. Ohne Angabe: meiner.
//
// Eigene Anfrage: Mein Tag stellt mit Terminen und Fristen schon viele
// Unteranfragen, siehe app/lib/vorgang-stand.server.ts.

export async function loader({ request, context }: any) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const alle = url.searchParams.get("scope") === "all";
  const von = url.searchParams.get("von");
  // Eine fremde Kennung nur, wenn sie wie eine aussieht -- sie landet in einem Filter.
  const person = !alle && von && /^[0-9a-f-]{36}$/i.test(von) ? von : userId;
  const kopf = new Headers(responseHeaders());
  kopf.set("Cache-Control", "private, no-store");
  return data(await ladeStillstand(supabase, person, alle ? "all" : "mine", crmToday()), { headers: kopf });
}
