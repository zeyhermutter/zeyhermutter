import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/notifications";
import { requireActiveUser } from "~/lib/auth.server";
import { zeitpunkt as formatDate } from "~/lib/format";
import { benachrichtigungsZiel } from "~/lib/benachrichtigungsziele";
import "~/notifications.css";
import "~/programm-liste.css";

import { ListenUeberschrift } from "~/components/listen-ueberschrift";
type ActionResult = { error?: string };
function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }

function safeRedirectTarget(value: string) { return value.startsWith("/") && !value.startsWith("//") ? value : "/crm/notifications"; }

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const { data: notifications, error } = await supabase.from("notifications").select("id, type, title, message, entity_type, entity_id, created_at, read_at").order("created_at", { ascending: false }).limit(100);
  if (error) throw new Response("Benachrichtigungen konnten nicht geladen werden.", { status: 500 });
  return data({ notifications: notifications ?? [] }, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env); const formData = await request.formData(); const intent = text(formData, "_intent");
  if (intent === "read") { const notificationId = text(formData, "notification_id"); const redirectTo = safeRedirectTarget(text(formData, "redirect_to")); const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId); if (error) return data<ActionResult>({ error: "Benachrichtigung konnte nicht aktualisiert werden." }, { status: 400, headers: responseHeaders() }); return redirect(redirectTo, { headers: responseHeaders() }); }
  if (intent === "read_all") { const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null); if (error) return data<ActionResult>({ error: "Benachrichtigungen konnten nicht aktualisiert werden." }, { status: 400, headers: responseHeaders() }); return redirect("/crm/notifications", { headers: responseHeaders() }); }
  return data<ActionResult>({ error: "Unbekannte Aktion." }, { status: 400, headers: responseHeaders() });
}

export default function Notifications() {
  const { notifications } = useLoaderData<typeof loader>(); const result = useActionData<typeof action>(); const unread = notifications.filter((item) => !item.read_at).length;
  // Programmliste (13.10.2026): Posteingang als Tabelle -- Eingang, Meldung,
  // Text, Aktion. Vorher je Meldung eine hohe Zeile mit zwei grossen Knoepfen.
  return <main className="editor-shell programm-liste"><ListenUeberschrift/>
    <div className="programm-liste-werkzeuge">
      <span className="programm-liste-zaehler programm-liste-zaehler-links"><strong>{unread}</strong> ungelesen · letzte {notifications.length}</span>
      {unread > 0 ? <Form method="post" className="programm-liste-rechts"><button className="secondary-button" type="submit" name="_intent" value="read_all">Alle als gelesen</button></Form> : null}
    </div>
    {result?.error ? <div className="form-error notifications-page-width">{result.error}</div> : null}
    <div className="programm-tabelle-rahmen">
      {notifications.length === 0 ? <p className="programm-liste-leer">Keine Benachrichtigungen vorhanden.</p> : <table className="programm-tabelle benachrichtigungen">
        <thead><tr><th>Eingang</th><th>Meldung</th><th>Text</th><th className="rechts">Aktion</th></tr></thead>
        <tbody>{notifications.map((notification) => {
          const target = benachrichtigungsZiel(notification.entity_type, notification.entity_id);
          return <tr className={notification.read_at ? undefined : "ungelesen"} key={notification.id}>
            <td className="zahl">{formatDate(notification.created_at)}</td>
            <td>{notification.read_at ? <Link to={target}>{notification.title}</Link> : <Form method="post"><input type="hidden" name="notification_id" value={notification.id}/><input type="hidden" name="redirect_to" value={target}/><button className="programm-tabelle-verweis" type="submit" name="_intent" value="read">{notification.title}</button></Form>}</td>
            <td className="leise">{notification.message ?? "—"}</td>
            <td className="rechts">{notification.read_at ? <span className="leise">gelesen</span> : <Form method="post"><input type="hidden" name="notification_id" value={notification.id}/><input type="hidden" name="redirect_to" value="/crm/notifications"/><button className="secondary-button" type="submit" name="_intent" value="read">Als gelesen markieren</button></Form>}</td>
          </tr>;
        })}</tbody>
      </table>}
    </div>
  </main>;
}
