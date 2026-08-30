import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/audit-history";
import { requirePermission } from "~/lib/auth.server";

const PAGE_SIZE = 50;

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

function valueLabel(value: unknown) {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "object") {
    const text = JSON.stringify(value);
    return text.length > 160 ? `${text.slice(0, 157)}…` : text;
  }
  const text = String(value);
  return text.length > 160 ? `${text.slice(0, 157)}…` : text;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requirePermission(request, context.cloudflare.env, "audit.read");
  const url = new URL(request.url);
  const entityType = (url.searchParams.get("entity") ?? "").trim();
  const action = (url.searchParams.get("action") ?? "").trim();
  const actor = (url.searchParams.get("actor") ?? "").trim();
  const reference = (url.searchParams.get("reference") ?? "").trim();
  const page = Math.max(1, Number(url.searchParams.get("page") ?? "1") || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let query = supabase
    .from("audit_events")
    .select("id, occurred_at, actor_display_name_snapshot, entity_type, entity_id, entity_reference, action, field_changes, source, description", { count: "exact" })
    .order("occurred_at", { ascending: false })
    .range(from, to);

  if (entityType) query = query.eq("entity_type", entityType);
  if (action) query = query.eq("action", action);
  if (actor) query = query.ilike("actor_display_name_snapshot", `%${actor}%`);
  if (reference) query = query.ilike("entity_reference", `%${reference}%`);

  const { data: events, count, error } = await query;
  if (error) throw new Response("Systemhistorie konnte nicht geladen werden.", { status: 500 });

  const total = count ?? 0;
  return data({ events: events ?? [], total, page, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)), filters: { entityType, action, actor, reference }, profile }, { headers: responseHeaders() });
}

function pageHref(page: number, filters: { entityType: string; action: string; actor: string; reference: string }) {
  const params = new URLSearchParams();
  if (filters.entityType) params.set("entity", filters.entityType);
  if (filters.action) params.set("action", filters.action);
  if (filters.actor) params.set("actor", filters.actor);
  if (filters.reference) params.set("reference", filters.reference);
  params.set("page", String(page));
  return `/crm/history?${params.toString()}`;
}

export default function AuditHistory() {
  const { events, total, page, pageCount, filters, profile } = useLoaderData<typeof loader>();

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">Audit · Geschäftsführer</p><h1 className="editor-title">Systemhistorie</h1></div>
        <div className="header-user"><span className="badge">{total} Ereignisse</span><small>{profile.display_name}</small></div>
      </header>

      <section className="data-card">
        <Form method="get" className="filter-grid">
          <label><span>Entity</span><select name="entity" defaultValue={filters.entityType}><option value="">Alle</option><option value="CONTACT">Kontakt</option><option value="ORGANIZATION">Organisation</option><option value="TASK">Aufgabe</option><option value="PROPERTY">Immobilie</option><option value="DOCUMENT">Dokument</option></select></label>
          <label><span>Aktion</span><select name="action" defaultValue={filters.action}><option value="">Alle</option><option value="CREATE">CREATE</option><option value="UPDATE">UPDATE</option><option value="STATUS_CHANGE">STATUS_CHANGE</option><option value="ARCHIVE">ARCHIVE</option><option value="RESTORE">RESTORE</option><option value="DELETE">DELETE</option></select></label>
          <label><span>Benutzer</span><input name="actor" defaultValue={filters.actor} placeholder="Name" /></label>
          <label><span>Referenz</span><input name="reference" defaultValue={filters.reference} placeholder="z. B. ZM-K-000002" /></label>
          <button className="secondary-button" type="submit">Filtern</button>
        </Form>
      </section>

      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Append-only</p><h2>Änderungen</h2></div><span className="subtle">Seite {page} / {pageCount}</span></div>
        <div className="history-list">
          {events.map((event) => {
            const changes = (event.field_changes ?? {}) as Record<string, { old?: unknown; new?: unknown }>;
            return (
              <article className="history-event" key={event.id}>
                <div className="history-head"><strong>{event.entity_type} · {event.entity_reference ?? event.entity_id ?? "—"} · {event.action}</strong><small>{formatDate(event.occurred_at)}</small></div>
                <p>{event.actor_display_name_snapshot ?? "System"} · Quelle {event.source}</p>
                {event.description ? <div className="history-change"><small>{event.description}</small></div> : null}
                {Object.entries(changes).slice(0, 12).map(([field, change]) => <div className="history-change" key={field}><span>{field}</span><small>{valueLabel(change?.old)} → {valueLabel(change?.new)}</small></div>)}
              </article>
            );
          })}
          {events.length === 0 ? <p className="empty-state">Keine Ereignisse für diese Filter.</p> : null}
        </div>
        {pageCount > 1 ? <div className="pagination">{page > 1 ? <Link className="secondary-button link-button" to={pageHref(page - 1, filters)}>← Zurück</Link> : <span />}{page < pageCount ? <Link className="secondary-button link-button" to={pageHref(page + 1, filters)}>Weiter →</Link> : null}</div> : null}
      </section>
    </main>
  );
}
