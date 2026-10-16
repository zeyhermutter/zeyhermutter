import { requirePermission } from "~/lib/auth.server";
import { ladeAuskunft } from "~/lib/auskunft.server";

// Datenauskunft als Datei (JSON) -- GET /crm/contacts/:contactId/auskunft/datei
// (P2-6, 16.10.2026). Dieselben Daten wie die lesbare Seite, vollständig mit
// allen Feldern. Erzeugt beim Abruf, nicht gespeichert.

export async function loader({ request, params, context }: any) {
  const { supabase, responseHeaders, userId, profile } = await requirePermission(request, context.cloudflare.env, "contact.read");
  const auskunft = await ladeAuskunft(supabase, params.contactId);
  if (!auskunft) throw new Response("Kontakt nicht gefunden oder nicht lesbar.", { status: 404, headers: responseHeaders() });

  // Festgehalten, dass und von wem die Datei erstellt wurde -- nicht, was drinsteht.
  await supabase.from("activity_events").insert({
    activity_type: "DATA_EXPORT", title: "Datenauskunft als Datei erstellt", actor_user_id: userId,
    contact_id: params.contactId, metadata: { format: "json", bereiche: auskunft.abschnitte.length, nicht_gelesen: auskunft.nichtGelesen },
  });

  const nummer = String(auskunft.kontakt.contact_number ?? "kontakt").replace(/[^A-Za-z0-9-]/g, "");
  const kopf = new Headers(responseHeaders());
  kopf.set("Content-Type", "application/json; charset=utf-8");
  kopf.set("Content-Disposition", `attachment; filename="auskunft-${nummer}-${auskunft.erstellt.slice(0, 10)}.json"`);
  kopf.set("Cache-Control", "private, no-store");
  const inhalt = {
    hinweis: "Alle im CRM gespeicherten Daten zu dieser Person. Dateien (Dokumente, Exposés, Ausweiskopien) sind mit ihren Angaben enthalten, nicht als Datei.",
    erstellt: auskunft.erstellt,
    erstellt_von: profile.display_name,
    nicht_vollstaendig_gelesen: auskunft.nichtGelesen,
    kontakt: auskunft.kontakt,
    einwilligungen: auskunft.einwilligungen,
    bereiche: Object.fromEntries(auskunft.abschnitte.map((a) => [a.schluessel, { titel: a.titel, datensaetze: a.zeilen }])),
  };
  return new Response(JSON.stringify(inhalt, null, 2), { headers: kopf });
}
