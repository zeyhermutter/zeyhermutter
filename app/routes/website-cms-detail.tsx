import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/website-cms-detail";
import { requirePermission } from "~/lib/auth.server";
import { isWebsitePageKey, normalizeWebsiteContent, WEBSITE_PAGE_DEFINITIONS } from "~/lib/website-content";
import "~/website-cms.css";

type ActionResult = { error?: string };
function text(fd: FormData, key: string) { return String(fd.get(key) ?? "").trim(); }
function formatDate(value: string | null) { return value ? new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value)) : "—"; }
function pageKeyFrom(value: string | undefined) { const key = String(value ?? "").toUpperCase(); return isWebsitePageKey(key) ? key : null; }
function workflowError(message: string) { if (message.includes("VERSION_CONFLICT")) return "Die Seite wurde zwischenzeitlich geändert. Bitte neu laden."; if (message.includes("PUBLISH_REQUIRED")) return "Dir fehlt die Berechtigung zum Veröffentlichen."; if (message.includes("WRITE_REQUIRED")) return "Dir fehlt die Berechtigung zum Bearbeiten."; if (message.includes("CANDIDATE_REQUIRED")) return "Bitte zuerst eine Vorschauversion erstellen."; return "Die CMS-Aktion konnte nicht ausgeführt werden."; }

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const pageKey = pageKeyFrom(params.pageKey); if (!pageKey) throw new Response("CMS-Seite nicht gefunden.", { status: 404 });
  const { supabase, responseHeaders, profile } = await requirePermission(request, context.cloudflare.env, "website.read");
  const [{ data: page, error }, { data: canWrite }, { data: canPublish }] = await Promise.all([
    supabase.from("website_pages").select("*").eq("page_key", pageKey).maybeSingle(),
    supabase.rpc("current_user_has_permission", { p_permission: "website.write" }),
    supabase.rpc("current_user_has_permission", { p_permission: "website.publish" }),
  ]);
  if (error || !page) throw new Response("CMS-Seite nicht gefunden.", { status: 404, headers: responseHeaders() });
  const { data: versions, error: versionError } = await supabase.from("website_page_versions").select("id,version_number,created_at,created_by,published_at,published_by,is_current_public").eq("website_page_id", page.id).order("version_number", { ascending: false }).limit(30);
  if (versionError) throw new Response("Versionshistorie konnte nicht geladen werden.", { status: 500, headers: responseHeaders() });
  const url = new URL(request.url);
  return data({ page, content: normalizeWebsiteContent(pageKey, page.draft_content), definition: WEBSITE_PAGE_DEFINITIONS[pageKey], versions: versions ?? [], canWrite: canWrite === true, canPublish: canPublish === true, profile, saved: url.searchParams.get("saved") === "1", published: url.searchParams.get("published") === "1" }, { headers: responseHeaders() });
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const pageKey = pageKeyFrom(params.pageKey); if (!pageKey) throw new Response("CMS-Seite nicht gefunden.", { status: 404 });
  const fd = await request.formData(); const intent = text(fd, "_intent");
  const permission = intent === "publish" ? "website.publish" : "website.write";
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, permission);
  const pageId = text(fd, "page_id"); const expectedVersion = Number(text(fd, "version"));
  if (!pageId || !Number.isInteger(expectedVersion) || expectedVersion < 1) return data<ActionResult>({ error: "Ungültiger Seitenstand." }, { status: 400, headers: responseHeaders() });

  if (intent === "save") {
    const definition = WEBSITE_PAGE_DEFINITIONS[pageKey]; const content: Record<string, string> = {};
    for (const field of definition.fields) { const value = text(fd, field.key); if (!value) return data<ActionResult>({ error: `„${field.label}“ darf nicht leer sein.` }, { status: 400, headers: responseHeaders() }); content[field.key] = value; }
    const seoTitle = text(fd, "seo_title"); if (!seoTitle) return data<ActionResult>({ error: "SEO-Titel darf nicht leer sein." }, { status: 400, headers: responseHeaders() });
    const { data: updated, error } = await supabase.from("website_pages").update({ draft_content: content, seo_title: seoTitle, seo_description: text(fd, "seo_description") || null, status: "DRAFT", candidate_version: null, has_unpublished_changes: true }).eq("id", pageId).eq("page_key", pageKey).eq("version", expectedVersion).select("id").maybeSingle();
    if (error) return data<ActionResult>({ error: "Entwurf konnte nicht gespeichert werden." }, { status: 400, headers: responseHeaders() });
    if (!updated) return data<ActionResult>({ error: "Die Seite wurde zwischenzeitlich geändert. Bitte neu laden." }, { status: 409, headers: responseHeaders() });
    return redirect(`/crm/website/${pageKey.toLowerCase()}?saved=1`, { headers: responseHeaders() });
  }

  if (intent === "prepare") {
    const { data: versionNumber, error } = await supabase.rpc("prepare_website_page", { p_page_id: pageId, p_expected_version: expectedVersion });
    if (error) return data<ActionResult>({ error: workflowError(error.message ?? "") }, { status: 400, headers: responseHeaders() });
    return redirect(`/crm/website/${pageKey.toLowerCase()}/preview?version=${versionNumber}`, { headers: responseHeaders() });
  }

  if (intent === "publish") {
    const { error } = await supabase.rpc("publish_website_page", { p_page_id: pageId, p_expected_version: expectedVersion });
    if (error) return data<ActionResult>({ error: workflowError(error.message ?? "") }, { status: 400, headers: responseHeaders() });
    return redirect(`/crm/website/${pageKey.toLowerCase()}?published=1`, { headers: responseHeaders() });
  }

  return data<ActionResult>({ error: "Unbekannte CMS-Aktion." }, { status: 400, headers: responseHeaders() });
}

export default function WebsiteCmsDetail() {
  const { page, content, definition, versions, canWrite, canPublish, profile, saved, published } = useLoaderData<typeof loader>(); const result = useActionData<typeof action>();
  return <main className="editor-shell website-cms-shell"><header className="editor-header"><div><Link className="back-link" to="/crm/website">← Website-CMS</Link><p className="eyebrow">{definition.path} · {page.page_key}</p><h1 className="editor-title">{definition.label}</h1><p className="editor-meta">Datensatzversion {page.version} · Live {page.published_version ?? "—"} · Kandidat {page.candidate_version ?? "—"}</p></div><div className="header-user"><span className={`website-state ${page.status.toLowerCase()}`}>{page.status === "PUBLISHED" && !page.has_unpublished_changes ? "Veröffentlicht" : page.status === "READY" ? "Vorschau bereit" : page.published_version ? "Änderungen offen" : "Entwurf"}</span><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div></header>
    {result?.error ? <div className="form-error">{result.error}</div> : null}{saved ? <div className="form-success">Entwurf gespeichert.</div> : null}{published ? <div className="form-success">Version veröffentlicht.</div> : null}
    <div className="website-cms-detail-grid"><section className="data-card"><div className="card-head"><div><p className="eyebrow">Entwurf</p><h2>Inhalte bearbeiten</h2></div><Link className="secondary-button link-button compact" to={definition.path} target="_blank">Live ↗</Link></div><Form method="post" className="website-cms-form"><input type="hidden" name="_intent" value="save"/><input type="hidden" name="page_id" value={page.id}/><input type="hidden" name="version" value={page.version}/>{definition.fields.map((field) => <label className="form-field full-width" key={field.key}><span>{field.label} *</span>{field.multiline ? <textarea name={field.key} rows={field.rows ?? 4} defaultValue={content[field.key] ?? ""} required disabled={!canWrite}/> : <input name={field.key} defaultValue={content[field.key] ?? ""} required disabled={!canWrite}/>}</label>)}<div className="website-seo-block"><p className="eyebrow">SEO</p><label className="form-field full-width"><span>SEO-Titel *</span><input name="seo_title" defaultValue={page.seo_title ?? ""} required disabled={!canWrite}/></label><label className="form-field full-width"><span>Meta-Beschreibung</span><textarea name="seo_description" rows={3} defaultValue={page.seo_description ?? ""} disabled={!canWrite}/></label></div><div className="form-actions"><button className="primary-button" type="submit" disabled={!canWrite}>Entwurf speichern</button></div></Form></section>
      <aside className="website-cms-side"><section className="data-card"><div className="card-head"><div><p className="eyebrow">Freigabe</p><h2>Vorschau & Live</h2></div></div><p className="workflow-help">Eine Vorschauversion friert den aktuellen Entwurf als unveränderlichen Snapshot ein. Erst danach kann veröffentlicht werden.</p><div className="website-workflow-actions"><Form method="post"><input type="hidden" name="_intent" value="prepare"/><input type="hidden" name="page_id" value={page.id}/><input type="hidden" name="version" value={page.version}/><button className="secondary-button" disabled={!canWrite}>Vorschauversion erstellen</button></Form>{page.candidate_version ? <><Link className="secondary-button link-button" to={`/crm/website/${page.page_key.toLowerCase()}/preview?version=${page.candidate_version}`} target="_blank">Kandidat ansehen ↗</Link><Form method="post"><input type="hidden" name="_intent" value="publish"/><input type="hidden" name="page_id" value={page.id}/><input type="hidden" name="version" value={page.version}/><button className="primary-button" disabled={!canPublish}>Version {page.candidate_version} veröffentlichen</button></Form></> : null}</div>{!canPublish ? <p className="empty-state">Für die Veröffentlichung ist <code>website.publish</code> erforderlich.</p> : null}</section>
      <section className="data-card"><div className="card-head"><div><p className="eyebrow">Historie</p><h2>Versionen</h2></div><span className="subtle">letzte 30</span></div><div className="history-list">{versions.map((version: any) => <article className="history-event" key={version.id}><div className="history-head"><strong>Version {version.version_number}{version.is_current_public ? " · LIVE" : page.candidate_version === version.version_number ? " · KANDIDAT" : ""}</strong><small>{formatDate(version.created_at)}</small></div><p>{version.published_at ? `Veröffentlicht ${formatDate(version.published_at)}` : "Nicht veröffentlicht"}</p><Link className="subtle-link" to={`/crm/website/${page.page_key.toLowerCase()}/preview?version=${version.version_number}`} target="_blank">Version ansehen ↗</Link></article>)}</div></section></aside></div>
  </main>;
}
