import { data } from "react-router";
import { requireActiveUser } from "~/lib/auth.server";
import { sucheUeberall } from "~/lib/globale-suche.server";
import { SUCHTREFFERART, beschrifte } from "~/lib/labels";

// Schnellsuche mit Strg+K (P2-2, 16.10.2026): GET /api/suche?q=…
// Dieselbe Suche wie die Trefferseite (app/lib/globale-suche.server.ts),
// hier die ersten acht Treffer. "mehr" sagt, dass die Trefferseite mehr hat.

const SCHNELL = 8;

export async function loader({ request, context }: any) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const q = (new URL(request.url).searchParams.get("q") ?? "").trim();
  const { treffer, mehr, fehler } = await sucheUeberall(supabase, q, false, SCHNELL);
  const kopf = new Headers(responseHeaders());
  kopf.set("Cache-Control", "private, no-store");
  return data({
    q,
    treffer: treffer.map((t) => ({
      key: `${t.entity_type}:${t.entity_id}`, art: beschrifte(SUCHTREFFERART, t.entity_type),
      nummer: t.reference, titel: t.title, unterzeile: t.subtitle, pfad: t.pfad,
    })),
    mehr,
    fehler,
  }, { headers: kopf });
}
