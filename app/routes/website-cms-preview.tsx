import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/website-cms-preview";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import { ContactIntroSections, ContactPersonal, HomePageSections, PublicLegalSection } from "~/components/public-page-sections";
import { requirePermission } from "~/lib/auth.server";
import { isWebsitePageKey, normalizeWebsiteContent } from "~/lib/website-content";
import "~/public-website.css";
import "~/homepage-variants.css";
import "~/homepage-v7-realtor.css";
import "~/website-cms.css";

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const pageKeyRaw = String(params.pageKey ?? "").toUpperCase(); if (!isWebsitePageKey(pageKeyRaw)) throw new Response("CMS-Seite nicht gefunden.", { status: 404 });
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "website.read"); const requested = Number(new URL(request.url).searchParams.get("version"));
  const { data: page, error } = await supabase.from("website_pages").select("id,label,path,candidate_version,published_version").eq("page_key", pageKeyRaw).maybeSingle(); if (error || !page) throw new Response("CMS-Seite nicht gefunden.", { status: 404, headers: responseHeaders() });
  const versionNumber = Number.isInteger(requested) && requested > 0 ? requested : page.candidate_version ?? page.published_version; if (!versionNumber) throw new Response("Keine Vorschauversion vorhanden.", { status: 404, headers: responseHeaders() });
  const { data: version, error: versionError } = await supabase.from("website_page_versions").select("version_number,content_snapshot,seo_title,seo_description,is_current_public,created_at").eq("website_page_id", page.id).eq("version_number", versionNumber).maybeSingle(); if (versionError || !version) throw new Response("Vorschauversion nicht gefunden.", { status: 404, headers: responseHeaders() });
  return data({ pageKey: pageKeyRaw, page, version, content: normalizeWebsiteContent(pageKeyRaw, version.content_snapshot) }, { headers: responseHeaders() });
}

export default function WebsiteCmsPreview() {
  const { pageKey, page, version, content } = useLoaderData<typeof loader>();
  return <main className="editor-shell website-preview-shell"><header className="website-preview-toolbar"><div><Link className="back-link" to={`/crm/website/${pageKey.toLowerCase()}`}>← CMS</Link><strong>{page.label} · Version {version.version_number}</strong></div><span className={`website-state ${version.is_current_public ? "published" : "ready"}`}>{version.is_current_public ? "LIVE" : "VORSCHAU"}</span></header><div className="website-preview-frame"><main className={`public-site${pageKey === "HOME" ? " hv-site hv7r-site" : ""}`}><PublicHeader/>{pageKey === "HOME" ? <HomePageSections content={content}/> : pageKey === "CONTACT" ? <><ContactIntroSections content={content}/><section className="public-contact-page"><ContactPersonal content={content}/><div className="public-contact-form-card website-form-preview"><strong>Kontaktformular</strong><p>Die Formulartechnik und CRM-Übergabe bleiben unverändert. Im CMS werden nur die freigegebenen Texte gepflegt.</p><label><span>{content.consent_text}</span></label><button className="public-primary-button dark" type="button" disabled>{content.submit_label}</button></div></section></> : <PublicLegalSection content={content} privacy={pageKey === "PRIVACY"}/>}<PublicFooter/></main></div></main>;
}
