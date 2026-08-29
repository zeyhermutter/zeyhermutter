import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/crm-archive";
import { requireActiveUser } from "~/lib/auth.server";

type EntityType = "CONTACT" | "ORGANIZATION" | "TASK";
type ActionResult = { error?: string };

function text(formData: FormData, key: string) {
  return String(formData.get(key) ?? "").trim();
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const entityType = (url.searchParams.get("type") ?? "CONTACT") as EntityType;
  const view = url.searchParams.get("view") === "archived" ? "archived" : "active";
  const archived = view === "archived";

  let items: Array<{ id: string; reference: string; title: string; subtitle: string; status: string; version: number }> = [];

  if (entityType === "CONTACT") {
    let query = supabase.from("contacts").select("id, contact_number, first_name, last_name, email, mobile, status, version").order("updated_at", { ascending: false }).limit(100);
    query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
    const { data: rows, error } = await query;
    if (error) throw new Response("Kontakte konnten nicht geladen werden.", { status: 500 });
    items = (rows ?? []).map((row) => ({ id: row.id, reference: row.contact_number, title: `${row.first_name} ${row.last_name}`, subtitle: row.email ?? row.mobile ?? "—", status: row.status, version: row.version }));
  } else if (entityType === "ORGANIZATION") {
    let query = supabase.from("organizations").select("id, organization_number, name, legal_form, city, status, version").order("updated_at", { ascending: false }).limit(100);
    query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
    const { data: rows, error } = await query;
    if (error) throw new Response("Organisationen konnten nicht geladen werden.", { status: 500 });
    items = (rows ?? []).map((row) => ({ id: row.id, reference: row.organization_number, title: row.name, subtitle: [row.legal_form, row.city].filter(Boolean).join(" · ") || "—", status: row.status, version: row.version }));
  } else {
    let query = supabase.from("tasks").select("id, task_number, title, priority, status, version").order("updated_at", { ascending: false }).limit(100);
    query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
    const { data: rows, error } = await query;
    if (error) throw new Response("Aufgaben konnten nicht geladen werden.", { status: 500 });
    items = (rows ?? []).map((row) => ({ id: row.id, reference: row.task_number, title: row.title, subtitle: row.priority, status: row.status, version: row.version }));
  }

  return data({ entityType, view, items, profile }, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const formData = await request.formData();
  const entityType = text(formData, "entity_type") as EntityType;
  const entityId = text(formData, "entity_id");
  const version = Number(text(formData, "version"));
  const intent = text(formData, "_intent");
  const view = intent === "restore" ? "archived" : "active";

  if (!entityId || !Number.isInteger(version) || version < 1 || !["archive", "restore"].includes(intent)) {
    return data<ActionResult>({ error: "Ungültige Archivaktion." }, { status: 400, headers: responseHeaders() });
  }

  const archivedAt = intent === "archive" ? new Date().toISOString() : null;
  const table = entityType === "CONTACT" ? "contacts" : entityType === "ORGANIZATION" ? "organizations" : "tasks";

  if (entityType === "TASK" && intent === "archive") {
    const { data: task } = await supabase.from("tasks").select("status").eq("id", entityId).maybeSingle();
    if (!task || !["DONE", "CANCELLED"].includes(task.status)) {
      return data<ActionResult>({ error: "Nur erledigte oder abgebrochene Aufgaben können archiviert werden." }, { status: 400, headers: responseHeaders() });
    }
  }

  const { data: updated, error } = await supabase
    .from(table)
    .update({ archived_at: archivedAt })
    .eq("id", entityId)
    .eq("version", version)
    .select("id")
    .maybeSingle();

  if (error) {
    return data<ActionResult>({ error: "Archivaktion wurde abgelehnt oder konnte nicht gespeichert werden." }, { status: 403, headers: responseHeaders() });
  }
  if (!updated) {
    return data<ActionResult>({ error: "Datensatz wurde zwischenzeitlich geändert. Bitte Ansicht neu laden." }, { status: 409, headers: responseHeaders() });
  }

  return redirect(`/crm/archive?type=${entityType}&view=${view}`, { headers: responseHeaders() });
}

export default function CrmArchive() {
  const { entityType, view, items, profile } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  const isArchived = view === "archived";

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">Modul 01 · CRM</p><h1 className="editor-title">Archivverwaltung</h1></div>
        <div className="header-user"><span className="badge">STAGING</span><small>{profile.display_name}</small></div>
      </header>

      {result?.error ? <div className="form-error">{result.error}</div> : null}

      <section className="data-card">
        <Form method="get" className="search-bar">
          <label><span>Datentyp</span><select name="type" defaultValue={entityType}><option value="CONTACT">Kontakte</option><option value="ORGANIZATION">Organisationen</option><option value="TASK">Aufgaben</option></select></label>
          <label><span>Ansicht</span><select name="view" defaultValue={view}><option value="active">Aktiv</option><option value="archived">Archiviert</option></select></label>
          <button className="secondary-button" type="submit">Anzeigen</button>
        </Form>
      </section>

      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">{isArchived ? "Archiv" : "Aktiv"}</p><h2>{items.length} Datensätze</h2></div></div>
        <div className="data-list">
          {items.map((item) => (
            <div className="data-row" key={item.id}>
              <div><strong>{item.title}</strong><small>{item.reference} · {item.subtitle} · {item.status}</small></div>
              <Form method="post">
                <input type="hidden" name="entity_type" value={entityType} />
                <input type="hidden" name="entity_id" value={item.id} />
                <input type="hidden" name="version" value={item.version} />
                <button className="text-button" name="_intent" value={isArchived ? "restore" : "archive"} type="submit">{isArchived ? "Wiederherstellen" : "Archivieren"}</button>
              </Form>
            </div>
          ))}
          {items.length === 0 ? <p className="empty-state">Keine Datensätze in dieser Ansicht.</p> : null}
        </div>
      </section>
    </main>
  );
}
