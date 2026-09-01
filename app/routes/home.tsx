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
    { title: "Verkaufspotenzial nutzen · Immobilien verkaufsfertig machen · ZeyherMutter" },
    { name: "description", content: "ZeyherMutter prüft vor der Vermarktung, welche Maßnahmen das Verkaufspotenzial einer Immobilie sinnvoll unterstützen können, koordiniert die Vorbereitung und übernimmt den Verkauf." },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request, context.cloudflare.env);
  const { data: rows, error } = await supabase.rpc("public_property_listings");
  return data({ featured: error ? [] : (rows ?? []).slice(0, 3) }, { headers: { "Cache-Control": "public, max-age=60, s-maxage=120" } });
}

const processSteps = [
  ["01", "Immobilie und Ziel verstehen", "Wir erfassen Ausgangslage, Verkaufsziel, Zeitrahmen und die Besonderheiten, die den Marktauftritt beeinflussen können."],
  ["02", "Verkaufswege vergleichen", "Ist-Zustand, gezielte Aufbereitung und erweiterte Maßnahmen werden nach Aufwand, Zeit und Verkaufsperspektive gegenübergestellt."],
  ["03", "Nur sinnvolle Maßnahmen umsetzen", "Sie entscheiden auf einer klaren Grundlage. Auf Wunsch koordinieren wir die ausgewählten Schritte und geeignete Partnerbetriebe."],
  ["04", "Verkaufsfertig vermarkten", "Danach übernehmen wir Positionierung, Präsentation, Interessentenprozess und Verkauf aus einer Hand."],
] as const;

const situations = [
  "Geerbte Immobilie",
  "Langjährig bewohntes Elternhaus",
  "Leerstehende Immobilie",
  "Renovierungsbedürftige Immobilie",
  "Eigentümer, die Vorbereitung und Verkauf aus einer Hand möchten",
] as const;

export default function Home() {
  const { featured } = useLoaderData<typeof loader>();
  return (
    <main className="public-site">
      <PublicHeader />
      <section className="public-home-hero public-home-hero-positioned">
        <div>
          <p className="public-eyebrow">Unser Ziel vor dem Verkauf</p>
          <h1>Das Verkaufspotenzial Ihrer Immobilie sinnvoll ausschöpfen.</h1>
          <p>Bevor Ihre Immobilie auf den Markt kommt, prüfen wir, welche Maßnahmen Präsentation, Nachfrage und Verkaufsperspektive voraussichtlich verbessern können. Wir empfehlen nur, was zu Ihrem Ziel passt – und übernehmen anschließend Vermarktung und Verkauf.</p>
          <div className="public-home-actions"><Link className="public-primary-button dark" to="/verkaufsfertig-check">Verkaufspotenzial prüfen lassen</Link><Link className="public-secondary-link" to="/immobilien">Immobilien ansehen →</Link></div>
        </div>
        <div className="public-hero-comparison" aria-label="Von der ungeprüften Ausgangslage zur verkaufsfertigen Immobilie">
          <div><span>Vorher</span><strong>Ungeprüft in den Markt</strong><small>Mögliche Hebel bleiben ungenutzt.</small></div><i aria-hidden="true">→</i><div><span>Verkaufsfertig</span><strong>Gezielt vorbereitet</strong><small>Klare Positionierung. Klarer Verkaufsweg.</small></div>
        </div>
      </section>

      <section className="public-story-section public-check-intro">
        <div><p className="public-eyebrow">Wofür wir das tun</p><h2>Nicht schöner um jeden Preis. Sondern verkaufsstärker, wo es sich lohnt.</h2></div>
        <div className="public-prose-large"><p>Viele Immobilien werden direkt angeboten, obwohl gezielte Vorbereitung den ersten Eindruck, die Positionierung oder den Verkaufsprozess verbessern kann. Gleichzeitig lohnt sich längst nicht jede Renovierung.</p><p><strong>Unser Ziel:</strong> vor dem Marktstart die Maßnahmen zu erkennen, die voraussichtlich einen sinnvollen Unterschied machen – und alles andere bewusst wegzulassen.</p></div>
      </section>

      <section className="public-decision-section">
        <div className="public-section-head"><div><p className="public-eyebrow">Woran wir jede Entscheidung messen</p><h2>Ein stärkerer Verkauf – wirtschaftlich, planbar und ohne unnötigen Aufwand.</h2></div><p>Der Verkaufsfertig-Check ist kein Renovierungsprogramm. Er ist die Entscheidungsgrundlage dafür, wie Ihre Immobilie am sinnvollsten in den Markt gehen sollte.</p></div>
        <div className="public-decision-grid">
          <article><span className="public-decision-icon yes" aria-hidden="true">↗</span><h3>Verkaufspotenzial nutzen</h3><p>Wir prüfen, welche Maßnahmen Präsentation, Zielgruppenansprache oder Verkaufsperspektive voraussichtlich stärken können.</p></article>
          <article><span className="public-decision-icon maybe" aria-hidden="true">€</span><h3>Budget und Zeit schützen</h3><p>Mehr Aufwand ist nicht automatisch besser. Kosten, Dauer und erwarteter Nutzen werden nachvollziehbar gegeneinander abgewogen.</p></article>
          <article><span className="public-decision-icon no" aria-hidden="true">✓</span><h3>Verkauf aus einer Hand</h3><p>Wenn der Weg feststeht, koordinieren wir auf Wunsch die Vorbereitung und übernehmen anschließend Vermarktung und Verkauf.</p></article>
        </div>
      </section>

      <section className="public-process-section">
        <div className="public-section-head"><div><p className="public-eyebrow">So erreichen wir das Ziel</p><h2>Erst entscheiden, wie die Immobilie in den Markt soll. Dann verkaufen.</h2></div></div>
        <ol className="public-process-grid">{processSteps.map(([number, title, copy]) => <li key={number}><span>{number}</span><h3>{title}</h3><p>{copy}</p></li>)}</ol>
      </section>

      <section className="public-situations-section">
        <div><p className="public-eyebrow">Wann das besonders sinnvoll ist</p><h2>Wenn vor dem Verkauf noch Entscheidungen, Vorbereitung oder Organisation anstehen.</h2><p>Gerade bei älteren, geerbten, leerstehenden oder renovierungsbedürftigen Immobilien ist oft nicht die Frage, ob man etwas tun kann – sondern was sich wirklich lohnt.</p></div>
        <ul>{situations.map((situation) => <li key={situation}><span aria-hidden="true">→</span>{situation}</li>)}</ul>
      </section>

      <section className="public-partner-note"><div aria-hidden="true">ZM</div><p><strong>ZeyherMutter bleibt Ihr Ansprechpartner für den gesamten Verkaufsweg.</strong> Zulassungspflichtige oder handwerkliche Arbeiten werden nicht von uns selbst ausgeführt, sondern – nach Ihrer Entscheidung – durch geeignete Partnerbetriebe. Wir können die ausgewählten Schritte koordinieren und führen anschließend die Vermarktung weiter.</p></section>

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
          <details><summary>Geht es darum, möglichst viel zu renovieren?</summary><p>Nein. Genau das möchten wir vermeiden. Wir vergleichen Aufwand, Zeitbedarf und den voraussichtlichen Nutzen. Auch die klare Empfehlung, eine Immobilie im Ist-Zustand zu verkaufen, kann das richtige Ergebnis sein.</p></details>
          <details><summary>Garantiert der Check einen höheren Verkaufspreis?</summary><p>Nein. Marktreaktion und Verkaufspreis lassen sich nicht garantieren. Der Check schafft eine fundierte Entscheidungsgrundlage dafür, welche Vorbereitung vor der Vermarktung voraussichtlich sinnvoll ist.</p></details>
          <details><summary>Wer führt Handwerksarbeiten aus?</summary><p>Geeignete Partnerbetriebe. ZeyherMutter übernimmt keine zulassungspflichtigen Handwerksleistungen, kann die ausgewählten Schritte aber auf Wunsch koordinieren.</p></details>
          <details><summary>Übernimmt ZeyherMutter danach auch den Verkauf?</summary><p>Ja. Unser Ansatz verbindet Vorbereitung und Immobilienvermittlung. Nach der Entscheidung über den passenden Weg können Positionierung, Vermarktung, Interessentenprozess und Verkauf bei uns weiterlaufen.</p></details>
        </div>
      </section>

      <section className="public-home-cta public-home-cta-positioned"><div><p className="public-eyebrow">Bevor Ihre Immobilie auf den Markt geht</p><h2>Prüfen wir, welcher Verkaufsweg ihr Potenzial am sinnvollsten nutzt.</h2><p>Sie erhalten Klarheit darüber, was sich voraussichtlich lohnt, was Sie sich sparen können und wie die Immobilie anschließend vermarktet werden sollte.</p></div><Link className="public-primary-button dark" to="/verkaufsfertig-check">Verkaufspotenzial prüfen lassen</Link></section>
      <PublicFooter />
    </main>
  );
}
