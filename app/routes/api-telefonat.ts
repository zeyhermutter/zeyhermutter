import { redirect } from "react-router";
import { requireActiveUser } from "~/lib/auth.server";
import { crmDateAtTimeToIso } from "~/lib/local-time";
import { TELEFONAT_ERGEBNIS } from "~/lib/telefonat";

// Ein Telefonat schnell erfassen (P1, 16.10.2026).
//
// WARUM
//
// Nach einem Anruf musste man in den Verlauf wechseln, dort "Telefonat"
// waehlen, einen Titel ausdenken und speichern -- und fuer den Rueckruf noch
// eine Aufgabe anlegen. Jetzt genuegt: Ergebnis antippen, optional eine
// Notiz und ein Datum fuer den Rueckruf. Der Verlaufseintrag entsteht wie
// bisher in activity_events (Typ PHONE_CALL), der Rueckruf als Aufgabe am
// Kontakt -- beide mit den Rechten des Benutzers.

const KENNUNG = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const text = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();

function rueckweg(roh: string, ergebnis: string) {
  const sicher = roh.startsWith("/") && !roh.startsWith("//") ? roh : "/crm/contacts";
  const url = new URL(sicher, "https://intern.invalid");
  url.searchParams.set("telefonat", ergebnis);
  return `${url.pathname}${url.search}#letzter-kontakt`;
}

export async function loader() {
  return redirect("/crm/contacts");
}

export async function action({ request, context }: any) {
  const { supabase, responseHeaders, userId } = await requireActiveUser(request, context.cloudflare.env);
  const fd = await request.formData();
  const zurueck = text(fd, "zurueck");
  const geh = (e: string) => redirect(rueckweg(zurueck, e), { headers: responseHeaders() });

  const kontaktId = text(fd, "kontakt_id");
  const ergebnis = text(fd, "ergebnis");
  if (!KENNUNG.test(kontaktId) || !(ergebnis in TELEFONAT_ERGEBNIS)) return geh("unvollstaendig");
  const notiz = text(fd, "notiz").slice(0, 4000);
  const rueckrufAm = /^\d{4}-\d{2}-\d{2}$/.test(text(fd, "rueckruf_am")) ? text(fd, "rueckruf_am") : "";

  const { data: kontakt } = await supabase.from("contacts").select("id,first_name,last_name").eq("id", kontaktId).maybeSingle();
  if (!kontakt) return geh("fehler");

  const { error } = await supabase.from("activity_events").insert({
    activity_type: "PHONE_CALL",
    title: `Telefonat · ${TELEFONAT_ERGEBNIS[ergebnis]}`,
    description: notiz || null,
    actor_user_id: userId,
    contact_id: kontaktId,
    metadata: { ergebnis, quelle: "schnell" },
  });
  if (error) return geh("fehler");

  if (rueckrufAm) {
    const due = crmDateAtTimeToIso(rueckrufAm, "09:00");
    const { data: darf } = await supabase.rpc("current_user_has_permission", { p_permission: "task.write" });
    if (!due || darf !== true) return geh("ohne_rueckruf");
    const name = `${kontakt.first_name ?? ""} ${kontakt.last_name ?? ""}`.trim();
    const { error: aufgabeFehler } = await supabase.from("tasks").insert({
      title: `Rückruf: ${name || "Kontakt"}`.slice(0, 300),
      description: notiz ? `Nach dem Telefonat (${TELEFONAT_ERGEBNIS[ergebnis]}):\n${notiz}` : `Nach dem Telefonat (${TELEFONAT_ERGEBNIS[ergebnis]}).`,
      status: "OPEN",
      priority: "NORMAL",
      due_at: due,
      responsible_user: userId,
      contact_id: kontaktId,
      created_by: userId,
      updated_by: userId,
    });
    if (aufgabeFehler) return geh("ohne_rueckruf");
    return geh("mit_rueckruf");
  }
  return geh("gespeichert");
}
