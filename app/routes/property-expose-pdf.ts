import { redirect } from "react-router";
import type { Route } from "./+types/property-expose-pdf";
import { requirePermission } from "~/lib/auth.server";

// "PDF herunterladen" in der Exposé-Akte (19.10.2026).
//
// Vorher stand am Knopf direkt eine signierte Speicheradresse (zehn Minuten
// gueltig, mehrere hundert Zeichen lang). Wer sie per "Link kopieren" an einen
// Interessenten schickte, verschickte einen internen Zugang, der nach zehn
// Minuten nicht mehr ging. Jetzt steht am Knopf diese kurze Adresse; sie
// funktioniert nur angemeldet und mit dem Recht, Exposés zu lesen, und leitet
// fuer eine Minute zum PDF weiter. Fuer Interessenten gibt es den kurzen Link
// aus der Anfrage (E-Mail schreiben, /e/<Kennung>).

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "expose.read");
  const propertyId = String(params.propertyId ?? ""), exposeId = String(params.exposeId ?? "");
  if (!UUID_RE.test(propertyId) || !UUID_RE.test(exposeId)) throw new Response("Exposé nicht gefunden.", { status: 404, headers: responseHeaders() });
  const { data: expose } = await supabase.from("property_exposes")
    .select("storage_bucket,storage_path,original_filename")
    .eq("id", exposeId).eq("property_id", propertyId).maybeSingle();
  if (!expose?.storage_bucket || !expose?.storage_path) throw new Response("Zu diesem Exposé gibt es noch kein PDF.", { status: 404, headers: responseHeaders() });
  const { data: signiert } = await supabase.storage.from(expose.storage_bucket)
    .createSignedUrl(expose.storage_path, 60, { download: expose.original_filename ?? "Expose.pdf" });
  if (!signiert?.signedUrl) throw new Response("Das PDF konnte nicht bereitgestellt werden.", { status: 500, headers: responseHeaders() });
  const kopf = responseHeaders();
  kopf.set("Cache-Control", "no-store");
  kopf.set("Referrer-Policy", "no-referrer");
  throw redirect(signiert.signedUrl, { headers: kopf });
}
