import { Link } from "react-router";
import type { Route } from "./+types/homepage-variant";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import { getHomepageVariant, homepageVariants } from "~/lib/homepage-variants";
import "~/public-website.css";
import "~/homepage-variants.css";

export function meta({ params }: Route.MetaArgs) {
  const variant = getHomepageVariant(params.variant);
  return [{ title: variant ? `${variant.name} · Homepage-Vorschau · ZeyherMutter` : "Homepage-Vorschau · ZeyherMutter" }];
}

export async function loader({ params, context }: Route.LoaderArgs) {
  if (context.cloudflare.env.APP_ENV !== "beta") throw new Response("Nicht gefunden", { status: 404 });
  const variant = getHomepageVariant(params.variant);
  if (!variant) throw new Response("Variante nicht gefunden", { status: 404 });
  return { variant };
}

function PreviewBar({ id, name }: { id: string; name: string }) {
  const previous = Number(id) > 1 ? String(Number(id) - 1) : null;
  const next = Number(id) < homepageVariants.length ? String(Number(id) + 1) : null;
  return (
    <div className="hv-preview-bar">
      <Link to="/homepage-varianten">← Übersicht</Link>
      <strong>Version {id} · {name}</strong>
      <div>{previous ? <Link to={`/homepage-varianten/${previous}`}>← {previous}</Link> : <span />}{next ? <Link to={`/homepage-varianten/${next}`}>{next} →</Link> : <span />}</div>
    </div>
  );
}

function Actions() {
  return <div className="hv-actions"><Link className="public-primary-button dark" to="/verkaufsfertig-check">Verkaufspotenzial prüfen lassen</Link><Link className="hv-text-link" to="/immobilien">Immobilien ansehen →</Link></div>;
}

function VariantOne() {
  return <>
    <section className="hv1-hero">
      <div className="hv1-copy"><p className="public-eyebrow">Vor dem Verkauf die richtige Entscheidung treffen</p><h1>Das Potenzial Ihrer Immobilie beginnt vor dem Inserat.</h1><p className="hv-lead">Wir prüfen, welcher Verkaufsweg zu Immobilie, Zeitrahmen und Ziel passt. Nicht mehr renovieren als nötig – sondern gezielt das tun, was Präsentation und Verkaufsperspektive sinnvoll stärkt.</p><Actions /></div>
      <div className="hv1-stack" aria-label="Drei Schritte bis zur Vermarktung"><article><span>01</span><div><small>Ausgangslage</small><strong>Immobilie verstehen</strong><p>Zustand, Ziel und Zeitrahmen erfassen.</p></div></article><article><span>02</span><div><small>Entscheidung</small><strong>Verkaufswege vergleichen</strong><p>Aufwand, Kosten und Wirkung abwägen.</p></div></article><article className="accent"><span>03</span><div><small>Ergebnis</small><strong>Verkaufsfertig vermarkten</strong><p>Klar positioniert in den Markt starten.</p></div></article></div>
    </section>
    <section className="hv1-manifesto"><p>Unser Ziel ist nicht, eine Immobilie möglichst aufwendig zu verändern.</p><h2>Sondern vor dem Marktstart herauszufinden, was sich wirklich lohnt.</h2></section>
    <section className="hv1-principles"><article><span>↗</span><h3>Potenzial nutzen</h3><p>Hebel erkennen, die den Marktauftritt und die Nachfrage voraussichtlich verbessern.</p></article><article><span>€</span><h3>Aufwand schützen</h3><p>Kosten und Zeit nur dort investieren, wo ein nachvollziehbarer Nutzen erwartet wird.</p></article><article><span>✓</span><h3>Alles aus einer Hand</h3><p>Nach der Entscheidung übernehmen wir Vorbereitung, Positionierung, Vermarktung und Verkauf.</p></article></section>
    <section className="hv-wide-cta"><div><p className="public-eyebrow">Der erste Schritt</p><h2>Bevor Sie verkaufen, klären wir wie.</h2></div><Link className="public-primary-button dark" to="/verkaufsfertig-check">Verkaufsfertig-Check starten</Link></section>
  </>;
}

function VariantTwo() {
  return <>
    <section className="hv2-hero"><p className="public-eyebrow">Welcher Verkaufsweg ist der richtige?</p><h1>Drei Wege. Eine fundierte Entscheidung.</h1><p>Eine Immobilie kann im Ist-Zustand, gezielt aufbereitet oder umfassender vorbereitet in den Markt gehen. Wir machen sichtbar, welcher Weg für Ihre Situation voraussichtlich am sinnvollsten ist.</p><Actions /></section>
    <section className="hv2-scenarios"><article><span>A</span><h2>Im Ist-Zustand verkaufen</h2><p>Wenn zusätzliche Maßnahmen wirtschaftlich oder zeitlich keinen überzeugenden Vorteil bringen.</p><dl><div><dt>Aufwand</dt><dd>niedrig</dd></div><div><dt>Zeit</dt><dd>kurz</dd></div><div><dt>Investition</dt><dd>gering</dd></div></dl></article><article className="recommended"><div className="hv2-badge">häufig der gezielte Mittelweg</div><span>B</span><h2>Gezielt verkaufsfertig machen</h2><p>Ausgewählte Maßnahmen verbessern Präsentation und Marktauftritt, ohne unnötig zu renovieren.</p><dl><div><dt>Aufwand</dt><dd>gezielt</dd></div><div><dt>Zeit</dt><dd>planbar</dd></div><div><dt>Investition</dt><dd>kontrolliert</dd></div></dl></article><article><span>C</span><h2>Erweitert vorbereiten</h2><p>Wenn größere Maßnahmen voraussichtlich einen klaren wirtschaftlichen oder strategischen Vorteil schaffen.</p><dl><div><dt>Aufwand</dt><dd>höher</dd></div><div><dt>Zeit</dt><dd>länger</dd></div><div><dt>Investition</dt><dd>bewusst</dd></div></dl></article></section>
    <section className="hv2-explain"><div><p className="public-eyebrow">Was Sie am Ende wissen</p><h2>Was tun. Was lassen. Wie verkaufen.</h2></div><ol><li><span>01</span><p><strong>Welche Maßnahmen sinnvoll erscheinen</strong> – und welche nicht.</p></li><li><span>02</span><p><strong>Welche Kosten und Zeiträume</strong> damit verbunden sind.</p></li><li><span>03</span><p><strong>Wie die Immobilie anschließend positioniert</strong> und vermarktet werden sollte.</p></li></ol></section>
    <section className="hv-wide-cta dark"><div><p className="public-eyebrow">Nicht raten. Vergleichen.</p><h2>Treffen wir die Verkaufsentscheidung vor dem Marktstart.</h2></div><Link className="public-primary-button" to="/verkaufsfertig-check">Verkaufswege prüfen</Link></section>
  </>;
}

function VariantThree() {
  const steps = [["01","Verstehen","Wir erfassen Immobilie, Ziel, Zustand und Ihren zeitlichen Rahmen."],["02","Bewerten","Wir vergleichen die realistischen Verkaufswege nach Aufwand, Kosten und Perspektive."],["03","Vorbereiten","Nur die ausgewählten Maßnahmen werden koordiniert und umgesetzt."],["04","Verkaufen","Wir übernehmen Positionierung, Präsentation, Interessentenprozess und Abschluss."]] as const;
  return <>
    <section className="hv3-hero"><div><p className="public-eyebrow">Ein Ansprechpartner vom ersten Gedanken bis zum Verkauf</p><h1>Ein klarer Weg für Ihre Immobilie.</h1><p className="hv-lead">Verkaufen beginnt nicht mit dem Exposé. Es beginnt mit der Frage, wie Ihre Immobilie am sinnvollsten in den Markt gehen sollte.</p><Actions /></div><aside><span>Unser Versprechen</span><strong>Sie behalten die Entscheidung. Wir schaffen die Grundlage dafür.</strong><p>Keine pauschale Renovierungsempfehlung, keine unnötigen Maßnahmen und kein Bruch zwischen Vorbereitung und Vermarktung.</p></aside></section>
    <section className="hv3-journey"><div className="hv3-title"><p className="public-eyebrow">Der Verkaufsweg</p><h2>Vier Schritte. Ein roter Faden.</h2><p>Jede Phase baut auf der vorherigen Entscheidung auf. So bleibt der Prozess nachvollziehbar und planbar.</p></div><ol>{steps.map(([n,t,c])=><li key={n}><span>{n}</span><div><h3>{t}</h3><p>{c}</p></div></li>)}</ol></section>
    <section className="hv3-outcomes"><article><small>Am Anfang</small><strong>Viele offene Fragen</strong><p>Was lohnt sich? Wie viel investieren? Wann starten?</p></article><div aria-hidden="true">→</div><article className="accent"><small>Vor dem Marktstart</small><strong>Ein abgestimmter Verkaufsplan</strong><p>Maßnahmen, Budget, Positionierung und Vermarktung greifen ineinander.</p></article></section>
    <section className="hv-wide-cta"><div><p className="public-eyebrow">Ihr nächster Schritt</p><h2>Starten wir mit der Ausgangslage.</h2></div><Link className="public-primary-button dark" to="/verkaufsfertig-check">Immobilie prüfen lassen</Link></section>
  </>;
}

function VariantFour() {
  return <>
    <section className="hv4-hero"><div><p className="public-eyebrow">Verkaufsfertig heißt wirtschaftlich entscheiden</p><h1>Was bringt eine Maßnahme – und was kostet sie?</h1><p className="hv-lead">Wir betrachten Vorbereitung nicht als Selbstzweck. Entscheidend ist, ob Aufwand, Zeit und erwartete Wirkung zu Ihrem Verkaufsziel passen.</p><Actions /></div><div className="hv4-dashboard"><div className="hv4-status"><span>Entscheidungsgrundlage</span><strong>Kosten × Zeit × Wirkung</strong></div><div className="hv4-metrics"><article><small>Kosten</small><strong>kontrollieren</strong><i style={{"--fill":"58%"} as React.CSSProperties}/></article><article><small>Zeit</small><strong>planen</strong><i style={{"--fill":"72%"} as React.CSSProperties}/></article><article><small>Wirkung</small><strong>bewerten</strong><i style={{"--fill":"86%"} as React.CSSProperties}/></article></div><div className="hv4-result"><span>Ergebnis</span><strong>Ein begründeter Verkaufsweg statt Bauchgefühl.</strong></div></div></section>
    <section className="hv4-table"><div><p className="public-eyebrow">Was wir vergleichen</p><h2>Eine Entscheidungsmatrix für den Verkauf.</h2></div><div className="hv4-matrix"><div className="head"><span>Option</span><span>Investition</span><span>Zeit</span><span>Wirkung</span></div><div><strong>Ist-Zustand</strong><span>●○○○</span><span>●○○○</span><span>●●○○</span></div><div className="focus"><strong>Gezielte Aufbereitung</strong><span>●●○○</span><span>●●○○</span><span>●●●●</span></div><div><strong>Erweiterte Maßnahmen</strong><span>●●●●</span><span>●●●●</span><span>●●●○</span></div></div></section>
    <section className="hv4-values"><article><strong>Keine Preisgarantie.</strong><p>Marktreaktionen lassen sich nicht versprechen. Wir schaffen Transparenz für die Entscheidung davor.</p></article><article><strong>Keine Renovierung um jeden Preis.</strong><p>Auch „nichts tun“ kann die wirtschaftlich richtige Empfehlung sein.</p></article><article><strong>Kein Medienbruch.</strong><p>Wenn der Weg steht, übernehmen wir die Vermarktung direkt weiter.</p></article></section>
    <section className="hv-wide-cta dark"><div><p className="public-eyebrow">Wirtschaftlich klar starten</p><h2>Prüfen wir Aufwand und Verkaufsperspektive.</h2></div><Link className="public-primary-button" to="/verkaufsfertig-check">Check anfragen</Link></section>
  </>;
}

function VariantFive() {
  const situations = ["Geerbtes Elternhaus", "Langjährig bewohnte Immobilie", "Leerstand vor dem Verkauf", "Renovierungsbedarf mit unklarem Umfang"];
  return <>
    <section className="hv5-hero"><div className="hv5-label">ZeyherMutter · Immobilienvermittlung</div><h1>Manche Immobilien brauchen vor dem Verkauf erst einmal Klarheit.</h1><p className="hv-lead">Was sollte noch gemacht werden? Was lohnt sich nicht mehr? Wie viel Zeit kostet die Vorbereitung? Und wie gelingt danach der Verkauf? Wir beantworten diese Fragen gemeinsam – und führen den Weg anschließend weiter.</p><Actions /></section>
    <section className="hv5-situations"><div><p className="public-eyebrow">Typische Situationen</p><h2>Wenn aus einer Immobilie eine ganze Aufgabenliste wird.</h2><p>Besonders bei älteren oder übernommenen Immobilien ist es schwer einzuschätzen, welche Schritte vor dem Verkauf wirklich nötig sind.</p></div><ul>{situations.map((s)=><li key={s}><span>✓</span>{s}</li>)}</ul></section>
    <section className="hv5-conversation"><blockquote>„Müssen wir wirklich noch renovieren – oder können wir so verkaufen?“</blockquote><div><p>Genau diese Frage soll der Verkaufsfertig-Check beantworten.</p><p>Wir betrachten Zustand, Ziel, Budget und Zeitrahmen, vergleichen die sinnvollen Optionen und sprechen eine nachvollziehbare Empfehlung aus. Die Entscheidung bleibt bei Ihnen.</p></div></section>
    <section className="hv5-care"><article><span>01</span><h3>Sie müssen nicht alles selbst organisieren.</h3><p>Geeignete Partner können koordiniert werden, wenn Maßnahmen sinnvoll und von Ihnen freigegeben sind.</p></article><article><span>02</span><h3>Sie behalten Kosten und Entscheidungen im Blick.</h3><p>Der Check trennt Notwendiges von Optionalem und macht den Weg transparent.</p></article><article><span>03</span><h3>Nach der Vorbereitung geht es direkt weiter.</h3><p>ZeyherMutter übernimmt anschließend Positionierung, Vermarktung und Verkauf.</p></article></section>
    <section className="hv-wide-cta warm"><div><p className="public-eyebrow">In Ruhe klären, dann gut verkaufen</p><h2>Schauen wir gemeinsam, was Ihre Immobilie vor dem Marktstart wirklich braucht.</h2></div><Link className="public-primary-button dark" to="/verkaufsfertig-check">Gespräch anfragen</Link></section>
  </>;
}

export default function HomepageVariantPreview({ loaderData }: Route.ComponentProps) {
  const { variant } = loaderData;
  return <main className={`public-site hv-site hv-version hv-version-${variant.id}`}><PreviewBar id={variant.id} name={variant.name}/><PublicHeader />{variant.id === "1" ? <VariantOne/> : variant.id === "2" ? <VariantTwo/> : variant.id === "3" ? <VariantThree/> : variant.id === "4" ? <VariantFour/> : <VariantFive/>}<PublicFooter /></main>;
}
