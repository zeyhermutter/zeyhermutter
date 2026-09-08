import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/public-private-sale";
import { loadPublicWebsitePage } from "~/lib/website-content.server";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import { PrivateSaleSections } from "~/components/public-page-sections";
import "~/public-website.css";

// In der Recherche über fünfzehn Maklerseiten war das die klarste Trennlinie:
// wer den Einwand "brauche ich überhaupt einen Makler" selbst aufgreift, wirkt
// souverän; alle anderen ignorieren ihn. Nur vier von fünfzehn tun es.
//
// Damit das kein Etikettenschwindel wird, stehen beide Spalten gleichwertig
// nebeneinander. Eine Seite, die den Einwand nur aufwirft, um ihn wegzuwischen,
// ist schlechter als gar keine.

export function meta({ data: routeData }: Route.MetaArgs) {
  const seite = routeData as { seoTitle?: string | null; seoDescription?: string | null } | undefined;
  return [
    { title: seite?.seoTitle || "Ohne Makler verkaufen? · ZeyherMutter" },
    { name: "description", content: seite?.seoDescription || "Wann sich der Verkauf in Eigenregie lohnt und wann er teuer wird — beide Seiten." },
    { name: "robots", content: "index,follow" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const page = await loadPublicWebsitePage(request, context.cloudflare.env, "PRIVATE_SALE");
  return data(page, { headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=300" } });
}

export default function PublicPrivateSale() {
  const { content } = useLoaderData<typeof loader>();
  return <main className="public-site">
    <PublicHeader />
    <PrivateSaleSections content={content} />
    <section className="zm-cta">
      <div><p className="public-eyebrow">Unverbindlich</p><h2>Erst reden, dann entscheiden.</h2></div>
      <div>
        <Link className="zm-primary" to="/bewertung">Einschätzung anfragen</Link>
        <Link className="zm-secondary" to="/kontakt">Einfach anrufen</Link>
      </div>
    </section>
    <PublicFooter />
  </main>;
}
