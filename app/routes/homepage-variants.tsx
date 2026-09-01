import { Link } from "react-router";
import type { Route } from "./+types/homepage-variants";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import { homepageVariants } from "~/lib/homepage-variants";
import "~/public-website.css";
import "~/homepage-variants.css";

export function meta() {
  return [{ title: "Homepage-Varianten · BETA · ZeyherMutter" }];
}

export async function loader({ context }: Route.LoaderArgs) {
  if (context.cloudflare.env.APP_ENV !== "beta") throw new Response("Nicht gefunden", { status: 404 });
  return null;
}

export default function HomepageVariants() {
  return (
    <main className="public-site hv-site">
      <PublicHeader />
      <section className="hv-overview-hero">
        <p className="public-eyebrow">BETA · Homepage-Auswahl</p>
        <h1>Fünf Richtungen für die neue Startseite.</h1>
        <p>Alle Varianten transportieren dasselbe Ziel: Verkaufspotenzial vor dem Marktstart sinnvoll prüfen, nur wirtschaftlich sinnvolle Maßnahmen umsetzen und anschließend Vermarktung und Verkauf aus einer Hand übernehmen.</p>
        <div className="hv-overview-note"><strong>Die aktuelle Homepage bleibt unverändert.</strong><span>Diese Seiten sind reine BETA-Vorschauen zum direkten Vergleich.</span></div>
      </section>

      <section className="hv-overview-grid" aria-label="Homepage-Varianten">
        {homepageVariants.map((variant) => (
          <article className={`hv-overview-card hv-overview-card-${variant.id}`} key={variant.id}>
            <div className="hv-overview-number">0{variant.id}</div>
            <p className="public-eyebrow">{variant.kicker}</p>
            <h2>{variant.name}</h2>
            <p>{variant.description}</p>
            <ul>{variant.traits.map((trait) => <li key={trait}>{trait}</li>)}</ul>
            <Link className="hv-open-link" to={`/homepage-varianten/${variant.id}`}>Version ansehen <span aria-hidden="true">→</span></Link>
          </article>
        ))}
      </section>

      <section className="hv-current-link">
        <div><p className="public-eyebrow">Referenz</p><h2>Aktuelle BETA-Homepage</h2><p>Zum direkten Vergleich kannst du jederzeit die derzeitige Startseite daneben öffnen.</p></div>
        <Link className="public-primary-button dark" to="/">Aktuelle Homepage öffnen</Link>
      </section>
      <PublicFooter />
    </main>
  );
}
