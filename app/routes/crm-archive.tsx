import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/crm-archive";
import "~/programm-liste.css";
import { requireActiveUser } from "~/lib/auth.server";
import { AUFGABENPRIORITAET, AUFGABENSTATUS, KONTAKTSTATUS, beschrifte } from "~/lib/labels";

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

  let items: Array<{ id: string; reference: string; title: string; subtitle: string; statusLabel: string; version: number }> = [];

  if (entityType === "CONTACT") {
    let query = supabase.from("contacts").select("id, contact_number, first_name, last_name, email, mobile, status, version").order("updated_at", { ascending: false }).limit(100);
    query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
    const { data: rows, error } = await query;
    if (error) throw new Response("Kontakte konnten nicht geladen werden.", { status: 500 });
    items = (rows ?? []).map((row) => ({ id: row.id, reference: row.contact_number, title: `${row.first_name} ${row.last_name}`, subtitle: row.email ?? row.mobile ?? "—", statusLabel: beschrifte(KONTAKTSTATUS, row.status), version: row.version }));
  } else if (entityType === "ORGANIZATION") {
    let query = supabase.from("organizations").select("id, organization_number, name, legal_form, city, status, version").order("updated_at", { ascending: false }).limit(100);
    query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
    const { data: rows, error } = await query;
    if (error) throw new Response("Organisationen konnten nicht geladen werden.", { status: 500 });
    items = (rows ?? []).map((row) => ({ id: row.id, reference: row.organization_number, title: row.name, subtitle: [row.legal_form, row.city].filter(Boolean).join(" · ") || "—", statusLabel: beschrifte(KONTAKTSTATUS, row.status), version: row.version }));
  } else {
    let query = supabase.from("tasks").select("id, task_number, title, priority, status, version").order("updated_at", { ascending: false }).limit(100);
    query = archived ? query.not("archived_at", "is", null) : query.is("archived_at", null);
    const { data: rows, error } = await query;
    if (error) throw new Response("Aufgaben konnten nicht geladen werden.", { status: 500 });
    items = (rows ?? []).map((row) => ({ id: row.id, reference: row.task_number, title: row.title, subtitle: beschrifte(AUFGABENPRIORITAET, row.priority), statusLabel: beschrifte(AUFGABENSTATUS, row.status), version: row.version }));
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

  // Programmliste (13.10.2026): Datentyp und Ansicht als Umschalter,
  // die Datensaetze als Tabelle mit Spalten.
  const typen: [string, string][] = [["CONTACT", "Kontakte"], ["ORGANIZATION", "Organisationen"], ["TASK", "Aufgaben"]];
  return (
    <main className="editor-shell programm-liste">
      <div className="programm-liste-werkzeuge">
        <nav className="programm-umfang" aria-label="Datentyp">
          {typen.map(([wert, name]) => <Link key={wert} className={entityType === wert ? "aktiv" : undefined} to={`/crm/archive?type=${wert}&view=${view}`}>{name}</Link>)}
        </nav>
        <nav className="programm-umfang" aria-label="Ansicht">
          <Link className={isArchived ? undefined : "aktiv"} to={`/crm/archive?type=${entityType}&view=active`}>Aktiv</Link>
          <Link className={isArchived ? "aktiv" : undefined} to={`/crm/archive?type=${entityType}&view=archived`}>Archiviert</Link>
        </nav>
        <span className="programm-liste-zaehler">{items.length} Datensätze</span>
      </div>

      {result?.error ? <div className="form-error">{result.error}</div> : null}

      <div className="programm-tabelle-rahmen">
        {items.length === 0 ? <p className="programm-liste-leer">Keine Datensätze in dieser Ansicht.</p> : <table className="programm-tabelle">
          <thead><tr><th>Nummer</th><th>Bezeichnung</th><th>Details</th><th>Stand</th><th className="rechts">Aktion</th></tr></thead>
          <tbody>{items.map((item) => (
            <tr key={item.id}>
              <td className="zahl">{item.reference}</td>
              <td><strong>{item.title}</strong></td>
              <td className="leise">{item.subtitle}</td>
              <td>{item.statusLabel}</td>
              <td className="rechts">
                <Form method="post">
                  <input type="hidden" name="entity_type" value={entityType} />
                  <input type="hidden" name="entity_id" value={item.id} />
                  <input type="hidden" name="version" value={item.version} />
                  <button className="secondary-button" name="_intent" value={isArchived ? "restore" : "archive"} type="submit">{isArchived ? "Wiederherstellen" : "Archivieren"}</button>
                </Form>
              </td>
            </tr>
          ))}</tbody>
        </table>}
      </div>
    </main>
  );
}
