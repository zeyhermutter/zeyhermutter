import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/home";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import "~/public-website.css";

function mediaUrl(item: any) {
  return item?.id && item?.source_version ? `/immobilien/medien/${item.id}/${item.source_version}` : null;
}
function money(value: unknown) {
  return value === null || value === undefined
    ? "Preis auf Anfrage"
    : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value));
}

export function meta() {
  return [
    { title: "Immobilien verkaufsfertig machen · ZeyherMutter" },
    { name: "description", content: "ZeyherMutter prüft, welche Maßnahmen sich vor einem Immobilienverkauf voraussichtlich lohnen, koordiniert die Vorbereitung und begleitet die Vermarktung." },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request, context.cloudflare.env);
  const { data: rows, error } = await supabase.rpc("public_property_listings");
  return data({ featured: error ? [] : (rows ?? []).slice(0, 3) }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=120" } });
}

const processSteps = [
  ["01", "Immobilie ansehen", "Wir erfassen Ausgangslage, Ziel, Zeitrahmen und die für den Verkauf relevanten Besonderheiten."],
  ["02", "Szenarien vergleichen", "Ist-Zustand, sinnvolle Aufbereitung und erweiterte Maßnahmen werden transparent gegenübergestellt."],
  ["03", "Maßnahmen organisieren", "Auf Wunsch koordinieren wir ausgewählte Schritte und geeignete Partnerbetriebe."],
  ["04", "Vermarkten und verkaufen", "Vorbereitung, Präsentation, Interessentenprozess und Verkauf bleiben in einer Hand."],
] as const;

const situations = [
  "Geerbte Immobilie",
  "Langjährig bewohntes Elternhaus",
  "Leerstehende Immobilie",
  "Renovierungsbedürftige Immobilie",
  "Eigentümer, die Organisation abgeben möchten",
] as const;

export default function Home() {
  const { featured } = useLoaderData<typeof loader>();
  return (
    <main className="public-site">
      <PublicHeader />
      <section className="public-home-hero public-home-hero-positioned">
        <div>
          <p className="public-eyebrow">Immobilienverkauf aus einer Hand</p>
          <h1>Erst verkaufsfertig. Dann überzeugend vermarktet.</h1>
          <p>Wir zeigen Ihnen, welche Maßnahmen sich vor dem Verkauf voraussichtlich lohnen – und kümmern uns auf Wunsch um Vorbereitung, Vermarktung und Verkauf.</p>
          <div className="public-home-actions"><Link className="public-primary-button dark" to="/verkaufsfertig-check">Verkaufsfertig-Check anfragen</Link><Link className="public-secondary-link" to="/immobilien">Immobilien ansehen →</Link></div>
        </div>
        <div className="public-hero-comparison" aria-label="Von der Ausgangslage zur Verkaufspräsentation">
          <div><span>Vorher</span><strong>Unklarer Aufwand</strong><small>Was ist nötig, was kann bleiben?</small></div><i aria-hidden="true">→</i><div><span>Verkaufsfertig</span><strong>Klare Entscheidung</strong><small>Gezielt vorbereiten und überzeugend zeigen.</small></div>
        </div>
      </section>

      <section className="public-story-section public-check-intro">
        <div><p className="public-eyebrow">Was ist der Verkaufsfertig-Check?</p><h2>Vor dem Verkauf die richtigen Fragen klären.</h2></div>
        <div className="public-prose-large"><p>Der Verkaufsfertig-Check verbindet die Besichtigung Ihrer Immobilie mit einer strukturierten Entscheidungsvorlage. Wir betrachten nicht nur einen möglichen Verkauf im Ist-Zustand, sondern auch ausgewählte Maßnahmen, ihren voraussichtlichen Aufwand und den zeitlichen Effekt.</p><p><strong>Das Ziel:</strong> eine nachvollziehbare Vorbereitung, die zu Ihrer Immobilie, Ihrem Zeitrahmen und Ihrem Budget passt.</p></div>
      </section>

      <section className="public-decision-section">
        <div className="public-section-head"><div><p className="public-eyebrow">Lohnt sich das?</p><h2>Gezielt verbessern – oder bewusst nichts tun.</h2></div><p>Mehr Aufwand ist nicht automatisch sinnvoll. Wir machen Annahmen sichtbar und unterscheiden zwischen notwendigen, empfehlenswerten und verzichtbaren Maßnahmen.</p></div>
        <div className="public-decision-grid">
          <article><span className="public-decision-icon yes" aria-hidden="true">✓</span><h3>Was sich voraussichtlich lohnt</h3><p>Maßnahmen mit verständlichem Nutzen, angemessenem Budget und passendem Zeitbedarf.</p></article>
          <article><span className="public-decision-icon maybe" aria-hidden="true">↗</span><h3>Was wir zunächst prüfen</h3><p>Optionen, deren Wirkung von Zustand, Zielgruppe, Ausführung oder Marktumfeld abhängt.</p></article>
          <article><span className="public-decision-icon no" aria-hidden="true">—</span><h3>Was Sie sich sparen können</h3><p>Arbeiten, bei denen zusätzlicher Aufwand und erwarteter Nutzen voraussichtlich nicht zusammenpassen.</p></article>
        </div>
      </section>

      <section className="public-process-section">
        <div className="public-section-head"><div><p className="public-eyebrow">Der Ablauf</p><h2>Vom ersten Blick bis zum Verkauf.</h2></div></div>
        <ol className="public-process-grid">{processSteps.map(([number, title, copy]) => <li key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol>
      </section>

      <section className="public-situations-section">
        <div><p className="public-eyebrow">Typische Ausgangssituationen</p><h2>Wenn neben dem Verkauf auch die Vorbereitung organisiert werden muss.</h2><p>Besonders hilfreich ist der Check, wenn Entscheidungen, Termine und mehrere Beteiligte zusammengebracht werden sollen.</p></div>
        <ul>{situations.map((situation) => <li key={situation}><span aria-hidden="true">→</span>{situation}</li>)}</ul>
      </section>

      <section className="public-partner-note"><div aria-hidden="true">ZM</div><p><strong>Beratung und Koordination durch ZeyherMutter.</strong> Zulassungspflichtige oder handwerkliche Arbeiten werden nicht von uns selbst ausgeführt, sondern – nach Ihrer Entscheidung – durch geeignete Partnerbetriebe.</p></section>

      {featured.length ? (
        <section className="public-home-featured">
          <div className="public-section-head"><div><p className="public-eyebrow">Aktuelle Immobilien</p><h2>Neu im Angebot.</h2></div><Link to="/immobilien">Alle Immobilien →</Link></div>
          <div className="public-property-grid compact">{featured.map((row: any) => {
            const snapshot = row.snapshot ?? {};
            const main = (snapshot.media ?? [])[0];
            const image = mediaUrl(main);
            return <Link className="public-property-card" key={row.public_slug} to={`/immobilien/${row.public_slug}`}>{image ? <div className="public-property-image-wrap"><img className="public-property-image" src={image} alt={main.alt_text || main.title || row.public_title} /></div> : <div className="public-property-placeholder"><span>Immobilie</span></div>}<div className="public-property-card-body"><p className="public-eyebrow">{snapshot.transaction_type === "RENT" ? "Zur Miete" : "Zum Kauf"}</p><h2>{row.public_title}</h2><div className="public-property-facts"><strong>{money(snapshot.price)}</strong><span>{snapshot.living_area_sqm ? `${Number(snapshot.living_area_sqm)} m²` : ""}</span></div></div></Link>;
          })}</div>
        </section>
      ) : null}

      <section className="public-faq-section">
        <div><p className="public-eyebrow">Häufige Fragen</p><h2>Klarheit vor der Entscheidung.</h2></div>
        <div className="public-faq-list">
          <details><summary>Ist jede Renovierung vor dem Verkauf sinnvoll?</summary><p>Nein. Wir vergleichen Aufwand, Zeitbedarf und den voraussichtlichen Nutzen. Auch die klare Empfehlung gegen eine Maßnahme kann ein gutes Ergebnis sein.</p></details>
          <details><summary>Ist der geschätzte Verkaufspreis garantiert?</summary><p>Nein. Alle Werte sind fachliche Einschätzungen auf Basis der verfügbaren Informationen und keine Garantie eines bestimmten Verkaufspreises.</p></details>
          <details><summary>Wer führt Handwerksarbeiten aus?</summary><p>Geeignete Partnerbetriebe. ZeyherMutter übernimmt keine zulassungspflichtigen Handwerksleistungen, kann die ausgewählten Schritte aber auf Wunsch koordinieren.</p></details>
          <details><summary>Muss ich alle empfohlenen Maßnahmen beauftragen?</summary><p>Nein. Sie entscheiden, welche Maßnahmen zu Ihrem Budget, Ihrem Zeitplan und Ihren Zielen passen.</p></details>
        </div>
      </section>

      <section className="public-home-cta public-home-cta-positioned"><div><p className="public-eyebrow">Der nächste sinnvolle Schritt</p><h2>Welche Vorbereitung lohnt sich für Ihre Immobilie?</h2><p>Wir zeigen Ihnen, was sich vor dem Verkauf wirklich lohnt – und kümmern uns anschließend um Vorbereitung, Vermarktung und Verkauf.</p></div><Link className="public-primary-button dark" to="/verkaufsfertig-check">Verkaufsfertig-Check anfragen</Link></section>
      <PublicFooter />
    </main>
  );
}
