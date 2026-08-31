import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/notifications";
import { requireActiveUser } from "~/lib/auth.server";

type ActionResult = { error?: string };
function text(formData: FormData, key: string) { return String(formData.get(key) ?? "").trim(); }
function formatDate(value: string) { return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value)); }

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(request, context.cloudflare.env);
  const { data: notifications, error } = await supabase.from("notifications").select("id, type, title, message, entity_type, entity_id, created_at, read_at").order("created_at", { ascending: false }).limit(100);
  if (error) throw new Response("Benachrichtigungen konnten nicht geladen werden.", { status: 500 });
  return data({ notifications: notifications ?? [], profile }, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env); const formData = await request.formData(); const intent = text(formData, "_intent");
  if (intent === "read") { const notificationId = text(formData, "notification_id"); const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).eq("id", notificationId); if (error) return data<ActionResult>({ error: "Benachrichtigung konnte nicht aktualisiert werden." }, { status: 400, headers: responseHeaders() }); return redirect("/crm/notifications", { headers: responseHeaders() }); }
  if (intent === "read_all") { const { error } = await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null); if (error) return data<ActionResult>({ error: "Benachrichtigungen konnten nicht aktualisiert werden." }, { status: 400, headers: responseHeaders() }); return redirect("/crm/notifications", { headers: responseHeaders() }); }
  return data<ActionResult>({ error: "Unbekannte Aktion." }, { status: 400, headers: responseHeaders() });
}

function entityTarget(entityType: string | null, entityId: string | null) {
  if (entityType === "CONTACT" && entityId) return `/crm/contacts/${entityId}/collaboration`;
  if (entityType === "ORGANIZATION" && entityId) return `/crm/organizations/${entityId}`;
  if (entityType === "LEAD" && entityId) return `/leads/${entityId}`;
  if (entityType === "PROPERTY" && entityId) return `/properties/${entityId}`;
  return "/crm";
}

export default function Notifications() {
  const { notifications, profile } = useLoaderData<typeof loader>(); const result = useActionData<typeof action>(); const unread = notifications.filter((item) => !item.read_at).length;
  return <main className="editor-shell"><header className="editor-header"><div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">Zusammenarbeit</p><h1 className="editor-title">Benachrichtigungen</h1></div><div className="header-user"><span className="badge">{unread} ungelesen</span><small>{profile.display_name}</small></div></header>{result?.error ? <div className="form-error">{result.error}</div> : null}<section className="data-card"><div className="card-head"><div><p className="eyebrow">Inbox</p><h2>Letzte 100</h2></div>{unread > 0 ? <Form method="post"><button className="text-button" type="submit" name="_intent" value="read_all">Alle als gelesen</button></Form> : null}</div><div className="data-list">{notifications.map((notification) => <div className="data-row" key={notification.id}><div><strong>{notification.read_at ? notification.title : `● ${notification.title}`}</strong><small>{notification.message ?? notification.type} · {formatDate(notification.created_at)}</small></div><div className="inline-actions"><Link className="subtle-link" to={entityTarget(notification.entity_type, notification.entity_id)}>Öffnen</Link>{!notification.read_at ? <Form method="post"><input type="hidden" name="notification_id" value={notification.id} /><button className="text-button" type="submit" name="_intent" value="read">Gelesen</button></Form> : null}</div></div>)}{notifications.length === 0 ? <p className="empty-state">Keine Benachrichtigungen vorhanden.</p> : null}</div></section></main>;
}
