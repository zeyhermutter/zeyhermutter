import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/public-guide";
import { loadPublicWebsitePage } from "~/lib/website-content.server";
import { WEBSITE_PAGE_DEFINITIONS, RATGEBER_SEITEN } from "~/lib/website-content";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import "~/public-website.css";

// Die Übersicht holt Titel und Einleitung aus den vier Anlassseiten selbst,
// statt sie ein zweites Mal als eigene Felder zu führen. Sonst ändert jemand
// eine Überschrift und die Karte auf der Übersicht sagt weiter das Alte.

export function meta({ data: routeData }: Route.MetaArgs) {
  const seite = routeData as { seoTitle?: string | null; seoDescription?: string | null } | undefined;
  return [
    { title: seite?.seoTitle || "Ratgeber · ZeyherMutter" },
    { name: "description", content: seite?.seoDescription || "Vier Situationen, in denen ein Immobilienverkauf anders läuft — und was das konkret bedeutet." },
    { name: "robots", content: "index,follow" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const env = context.cloudflare.env;
  const [uebersicht, ...seiten] = await Promise.all([
    loadPublicWebsitePage(request, env, "GUIDE"),
    ...RATGEBER_SEITEN.map((key) => loadPublicWebsitePage(request, env, key)),
  ]);
  const karten = RATGEBER_SEITEN.map((key, index) => ({
    pfad: WEBSITE_PAGE_DEFINITIONS[key].path,
    eyebrow: seiten[index].content.eyebrow ?? "",
    titel: seiten[index].content.title ?? "",
    lead: seiten[index].content.lead ?? "",
  })).filter((karte) => karte.titel.trim().length > 0);

  return data({ ...uebersicht, karten },
    { headers: { "Cache-Control": "public, max-age=120, stale-while-revalidate=600" } });
}

export default function PublicGuide() {
  const { content, karten } = useLoaderData<typeof loader>();
  return <main className="public-site">
    <PublicHeader />
    <section className="public-hero">
      <p className="public-eyebrow">{content.eyebrow}</p>
      <h1>{content.title}</h1>
      <p>{content.lead}</p>
    </section>

    <section className="zm-ratgeber-gitter">
      {karten.map((karte) => (
        <Link key={karte.pfad} to={karte.pfad}>
          <p className="public-eyebrow">{karte.eyebrow}</p>
          <h2>{karte.titel}</h2>
          <p>{karte.lead}</p>
          <strong>Weiterlesen</strong>
        </Link>
      ))}
    </section>

    {content.note ? <p className="zm-ratgeber-hinweis">{content.note}</p> : null}

    <section className="zm-cta">
      <div><p className="public-eyebrow">Ihre Situation</p><h2>Steht Ihre nicht dabei?</h2></div>
      <div>
        <Link className="zm-primary" to="/kontakt">Dann fragen Sie uns</Link>
        <Link className="zm-secondary" to="/bewertung">Einschätzung anfragen</Link>
      </div>
    </section>
    <PublicFooter />
  </main>;
}
