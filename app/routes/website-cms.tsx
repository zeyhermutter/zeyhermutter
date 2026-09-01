import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/website-cms";
import { requirePermission } from "~/lib/auth.server";
import "~/website-cms.css";

function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value)) : "—"; }
function stateLabel(page: any) { if (page.status === "PUBLISHED" && !page.has_unpublished_changes) return "Veröffentlicht"; if (page.status === "READY") return "Version zur Freigabe bereit"; if (page.published_version) return "Veröffentlicht · Änderungen offen"; return "Entwurf"; }

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requirePermission(request, context.cloudflare.env, "website.read");
  const { data: pages, error } = await supabase.from("website_pages").select("id,page_key,path,label,status,candidate_version,published_version,has_unpublished_changes,updated_at,version").order("path");
  if (error) throw new Response("Website-CMS konnte nicht geladen werden.", { status: 500, headers: responseHeaders() });
  return data({ pages: pages ?? [], profile }, { headers: responseHeaders() });
}

export default function WebsiteCms() {
  const { pages, profile } = useLoaderData<typeof loader>();
  return <main className="editor-shell website-cms-shell">
    <header className="editor-header"><div><Link className="back-link" to="/crm">← CRM</Link><p className="eyebrow">Thema 12 · Website-CMS</p><h1 className="editor-title">Website-Inhalte</h1><p className="editor-meta">Entwurf, Vorschau und Veröffentlichung bleiben getrennt.</p></div><div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>
    <section className="data-card website-cms-principle"><div className="card-head"><div><p className="eyebrow">Publikationsprinzip</p><h2>Nur freigegebene Snapshots gehen live</h2></div></div><p>Bearbeitungen ändern zunächst nur den internen Entwurf. Erst eine vorbereitete Version kann mit der Berechtigung <code>website.publish</code> veröffentlicht werden. Bereits veröffentlichte Versionen bleiben unverändert erhalten.</p></section>
    <div className="website-cms-grid">{pages.map((page: any) => <article className="data-card website-page-card" key={page.id}><div className="card-head"><div><p className="eyebrow">{page.path}</p><h2>{page.label}</h2></div><span className={`website-state ${page.status.toLowerCase()}`}>{stateLabel(page)}</span></div><dl><div><dt>Live-Version</dt><dd>{page.published_version ?? "—"}</dd></div><div><dt>Kandidat</dt><dd>{page.candidate_version ?? "—"}</dd></div><div><dt>Zuletzt geändert</dt><dd>{formatDate(page.updated_at)}</dd></div></dl><div className="inline-actions"><Link className="primary-button link-button compact" to={`/crm/website/${page.page_key.toLowerCase()}`}>Bearbeiten</Link><Link className="secondary-button link-button compact" to={page.path} target="_blank">Live ↗</Link></div></article>)}</div>
  </main>;
}
