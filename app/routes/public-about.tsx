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

export function meta({ data: routeData }: Route.MetaArgs) {
  const seite = routeData as { seoTitle?: string | null; seoDescription?: string | null } | undefined;
  return [
    { title: seite?.seoTitle || "Über uns · ZeyherMutter" },
    { name: "description", content: seite?.seoDescription || "Wer hinter Zeyher & Mutter Immobilien in München steht." },
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
