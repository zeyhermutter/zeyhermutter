import { data, redirect } from "react-router";
import { requireActiveUser } from "~/lib/auth.server";

// Verlaufseintrag "WhatsApp geöffnet" (20.10.2026), siehe app/lib/whatsapp.ts.
// Wird beim Klick auf den Knopf im Hintergrund gerufen; die Seite wartet
// nicht darauf. Mit den Rechten des Benutzers (Policy activity_events_insert_crm).

const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function loader() {
  return redirect("/crm/contacts");
}

export async function action({ request, context }: any) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(request, context.cloudflare.env);
  const fd = await request.formData();
  const kontaktId = String(fd.get("kontakt_id") ?? "");
  if (!KENNUNG.test(kontaktId)) return data({ ok: false }, { status: 400, headers: responseHeaders() });
  const { error } = await supabase.from("activity_events").insert({
    activity_type: "WHATSAPP",
    title: "WhatsApp geöffnet",
    description: "Über den Knopf in der Kontaktakte. Ob die Nachricht abgeschickt wurde, weiß das CRM nicht.",
    actor_user_id: userId,
    contact_id: kontaktId,
    metadata: { quelle: "knopf" },
  });
  return data({ ok: !error }, { status: error ? 400 : 200, headers: responseHeaders() });
}
