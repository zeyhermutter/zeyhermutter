import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/crm-search";
import { requireActiveUser } from "~/lib/auth.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  const includeArchived = url.searchParams.get("archived") === "1";

  let results: Array<{
    entity_type: string;
    entity_id: string;
    reference: string;
    title: string;
    subtitle: string;
    status: string;
    updated_at: string;
    archived: boolean;
    version: number;
  }> = [];

  if (q.length >= 2) {
    const { data: searchResults, error } = await supabase.rpc("crm_global_search", {
      p_query: q,
      p_include_archived: includeArchived,
    });
    if (error) throw new Response("Suche konnte nicht ausgeführt werden.", { status: 500 });
    results = searchResults ?? [];
  }

  return data({ q, includeArchived, results, profile }, { headers: responseHeaders() });
}

function target(result: { entity_type: string; entity_id: string }) {
  if (result.entity_type === "CONTACT") return `/crm/contacts/${result.entity_id}`;
  if (result.entity_type === "ORGANIZATION") return `/crm/organizations/${result.entity_id}`;
  if (result.entity_type === "PROPERTY") return `/properties/${result.entity_id}`;
  if (result.entity_type === "LEAD") return `/leads/${result.entity_id}`;
  return "/crm/tasks";
}

export default function CrmSearch() {
  const { q, includeArchived, results, profile } = useLoaderData<typeof loader>();

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">ZeyherMutterOS</p><h1 className="editor-title">Globale Suche</h1></div>
        <div className="header-user"><span className="badge">STAGING</span><small>{profile.display_name}</small></div>
      </header>

      <section className="data-card">
        <Form method="get" className="search-bar">
          <input name="q" defaultValue={q} placeholder="Kontakt, Firma, Lead, Immobilie, Nummer, Adresse oder Aufgabe …" minLength={2} autoFocus />
          <label className="checkbox-row"><input type="checkbox" name="archived" value="1" defaultChecked={includeArchived} /><span>Archiv einbeziehen</span></label>
          <button className="primary-button" type="submit">Suchen</button>
        </Form>
      </section>

      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Ergebnisse</p><h2>{q.length >= 2 ? `${results.length} Treffer` : "Suchbegriff eingeben"}</h2></div><div className="inline-actions"><Link className="subtle-link" to="/leads">Leads</Link><Link className="subtle-link" to="/properties">Immobilien</Link></div></div>
        {q.length >= 2 && results.length === 0 ? <p className="empty-state">Keine Treffer gefunden.</p> : null}
        <div className="data-list">
          {results.map((result) => (
            <Link className="data-row data-row-link" to={target(result)} key={`${result.entity_type}-${result.entity_id}`}>
              <div><strong>{result.title}</strong><small>{result.entity_type} · {result.reference} · {result.subtitle}</small></div>
              <div className="row-meta"><span>{result.archived ? "ARCHIVIERT" : result.status}</span><small>{new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(result.updated_at))}</small></div>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}
