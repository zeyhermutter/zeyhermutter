import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

const HEADERS = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const GENAU = new Set([
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
const PREFIXE = ["/immobilien/", "/ratgeber/"];

function antwort(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: HEADERS });
}
function oeffentlich(path: string) {
  return GENAU.has(path) || PREFIXE.some((prefix) => path.startsWith(prefix));
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return antwort({ ok: false }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRole = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRole) return antwort({ ok: false }, 503);

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return antwort({ ok: false, error: "INVALID_REQUEST" }, 400);
  }

  const path = String(body.path ?? "").trim().slice(0, 240);
  const visitorHash = String(body.visitor_hash ?? "").trim().toLowerCase();
  if (!oeffentlich(path) || !/^[0-9a-f]{64}$/.test(visitorHash)) {
    return antwort({ ok: false, error: "INVALID_INPUT" }, 400);
  }

  const db = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });

  const seit = new Date(Date.now() - 20_000).toISOString();
  const { data: vorhanden, error: pruefFehler } = await db
    .from("audit_events")
    .select("id")
    .eq("entity_type", "WEBSITE_ACCESS")
    .eq("entity_reference", path)
    .eq("request_id", visitorHash)
    .gte("occurred_at", seit)
    .limit(1);
  if (pruefFehler) return antwort({ ok: false, error: "PROCESSING_FAILED" }, 500);
  if ((vorhanden ?? []).length > 0) return antwort({ ok: true, deduplicated: true });

  const { error } = await db.from("audit_events").insert({
    actor_type: "API",
    actor_user_id: null,
    actor_display_name_snapshot: null,
    entity_type: "WEBSITE_ACCESS",
    entity_id: null,
    entity_reference: path,
    action: "VIEW",
    field_changes: {},
    description: null,
    source: "API",
    request_id: visitorHash,
    metadata: {
      source: "PUBLIC_WEBSITE",
      privacy: "NO_IP_NO_USER_AGENT_NO_REFERRER_NO_QUERY",
      session_scope: "BROWSER_TAB",
    },
  });
  if (error) {
    console.error("website-analytics insert failed", { code: error.code ?? "UNKNOWN" });
    return antwort({ ok: false, error: "PROCESSING_FAILED" }, 500);
  }

  return antwort({ ok: true });
});
