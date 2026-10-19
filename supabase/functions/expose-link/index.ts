import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.4";

// Loest einen kurzen Exposé-Link auf (A7, 19.10.2026).
//
// Der Worker ruft diese Funktion fuer /e/<Kennung> mit dem
// veroeffentlichbaren Schluessel -- der Empfaenger der E-Mail ist nicht
// angemeldet, deshalb verify_jwt = false. In der Datenbank steht nur der
// SHA-256 der Kennung (public.expose_links.token_hash).
//
// Antwort:
//   { ok: true, url }            Download-Adresse, 60 Sekunden gueltig
//   { ok: false, grund }         UNBEKANNT | ABGELAUFEN | ZURUECKGEZOGEN | NICHT_FREIGEGEBEN
//
// Es wird nichts geschrieben und nichts gezaehlt.

const kopf = { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" };
const antwort = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: kopf });
const KENNUNG = /^[A-Za-z0-9_-]{22}$/;

async function sha256(text: string) {
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return antwort({ ok: false }, 405);
  const url = Deno.env.get("SUPABASE_URL");
  const dienstrolle = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !dienstrolle) return antwort({ ok: false }, 503);

  let kennung = "";
  try {
    kennung = String((await request.json())?.token ?? "");
  } catch {
    return antwort({ ok: false, grund: "UNBEKANNT" }, 400);
  }
  if (!KENNUNG.test(kennung)) return antwort({ ok: false, grund: "UNBEKANNT" }, 404);

  const db = createClient(url, dienstrolle, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: link, error } = await db.from("expose_links")
    .select("expires_at,revoked_at,property_exposes(status,archived_at,storage_bucket,storage_path,original_filename)")
    .eq("token_hash", await sha256(kennung)).maybeSingle();
  if (error) {
    console.error("expose-link lookup failed", { code: error.code ?? "UNKNOWN" });
    return antwort({ ok: false }, 500);
  }
  if (!link) return antwort({ ok: false, grund: "UNBEKANNT" }, 404);
  if (link.revoked_at) return antwort({ ok: false, grund: "ZURUECKGEZOGEN" }, 410);
  if (new Date(link.expires_at).getTime() <= Date.now()) return antwort({ ok: false, grund: "ABGELAUFEN" }, 410);

  const expose = (Array.isArray(link.property_exposes) ? link.property_exposes[0] : link.property_exposes) as
    { status: string; archived_at: string | null; storage_bucket: string | null; storage_path: string | null; original_filename: string | null } | null;
  if (!expose || expose.status !== "RELEASED" || expose.archived_at || !expose.storage_bucket || !expose.storage_path) {
    return antwort({ ok: false, grund: "NICHT_FREIGEGEBEN" }, 410);
  }

  const { data: signiert } = await db.storage.from(expose.storage_bucket)
    .createSignedUrl(expose.storage_path, 60, { download: expose.original_filename ?? "Expose.pdf" });
  if (!signiert?.signedUrl) return antwort({ ok: false }, 500);
  return antwort({ ok: true, url: signiert.signedUrl });
});
