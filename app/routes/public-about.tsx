import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/public-about";
import { loadPublicWebsitePage } from "~/lib/website-content.server";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import { AboutSections } from "~/components/public-page-sections";
import "~/public-website.css";

// Alle fünfzehn untersuchten Maklerseiten haben eine solche Seite; sie ist die
// einzige, die wirklich jeder hat. Der Inhalt kommt vollständig aus dem
// Website-CMS: Namen, Werdegang und Jahreszahlen kenne ich nicht, und eine
// erfundene Unternehmensgeschichte wäre schlimmer als eine leere Seite.

// Solange im CMS keine Fassung veroeffentlicht ist, zeigt die Seite den
// Standardtext -- und der sagt selbst, dass der Inhalt fehlt. Eine solche Seite
// gehoert nicht in den Index; sie steht aus demselben Grund auch nicht in der
// Sitemap (SEITEN_OHNE_HINTERLEGTEN_TEXT in app/lib/public-pages.ts). Sobald
// eine Fassung veroeffentlicht ist, faellt die Sperre von selbst weg.
export function meta({ data: routeData }: Route.MetaArgs) {
  const seite = routeData as { seoTitle?: string | null; seoDescription?: string | null; version?: number | null } | undefined;
  return [
    { title: seite?.seoTitle || "Über uns · ZeyherMutter" },
    { name: "description", content: seite?.seoDescription || "Wer hinter Zeyher & Mutter Immobilien in München steht." },
    { name: "robots", content: seite?.version ? "index,follow" : "noindex,follow" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const page = await loadPublicWebsitePage(request, context.cloudflare.env, "ABOUT");
  return data(page, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}

export default function PublicAbout() {
  const { content } = useLoaderData<typeof loader>();
  return <main className="public-site">
    <PublicHeader />
    <AboutSections content={content} />
    <section className="zm-cta">
      <div><p className="public-eyebrow">Nächster Schritt</p><h2>{content.cta_title}</h2></div>
      <div>
        <Link className="zm-primary" to="/kontakt">Gespräch vereinbaren</Link>
        <Link className="zm-secondary" to="/referenzen">Referenzen ansehen</Link>
      </div>
    </section>
    <PublicFooter />
  </main>;
}
