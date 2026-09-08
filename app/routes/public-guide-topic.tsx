import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/public-guide-topic";
import { loadPublicWebsitePage } from "~/lib/website-content.server";
import { WEBSITE_PAGE_DEFINITIONS, RATGEBER_SEITEN, type RatgeberSeite } from "~/lib/website-content";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import { RatgeberSections } from "~/components/public-page-sections";
import "~/public-website.css";

// Eine Route für alle vier Anlassseiten. Der Pfad entscheidet, welcher
// CMS-Schlüssel geladen wird; ein unbekannter Pfad ergibt 404 statt einer
// leeren Seite mit Vorbelegungstexten.

const PFAD_ZU_SCHLUESSEL = new Map<string, RatgeberSeite>(
  RATGEBER_SEITEN.map((key) => [WEBSITE_PAGE_DEFINITIONS[key].path.replace("/ratgeber/", ""), key]),
);

export function meta({ data: routeData }: Route.MetaArgs) {
  const seite = routeData as { seoTitle?: string | null; seoDescription?: string | null; content?: Record<string, string> } | undefined;
  return [
    { title: seite?.seoTitle || `${seite?.content?.eyebrow ?? "Ratgeber"} · ZeyherMutter` },
    { name: "description", content: seite?.seoDescription || seite?.content?.lead || "" },
    { name: "robots", content: "index,follow" },
  ];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const schluessel = PFAD_ZU_SCHLUESSEL.get(String(params.thema ?? ""));
  if (!schluessel) throw new Response("Seite nicht gefunden.", { status: 404 });
  const page = await loadPublicWebsitePage(request, context.cloudflare.env, schluessel);
  return data(page, { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" } });
}

export default function PublicGuideTopic() {
  const { content } = useLoaderData<typeof loader>();
  return <main className="public-site">
    <PublicHeader />
    <RatgeberSections content={content} />
    <section className="zm-cta">
      <div><p className="public-eyebrow">Nächster Schritt</p><h2>{content.cta_title}</h2></div>
      <div>
        <Link className="zm-primary" to="/kontakt">Gespräch vereinbaren</Link>
        <Link className="zm-secondary" to="/ratgeber">Zurück zum Ratgeber</Link>
      </div>
    </section>
    <PublicFooter />
  </main>;
}
