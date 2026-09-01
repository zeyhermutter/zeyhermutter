import { data, Form, Link, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/public-sales-readiness";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import { isSellerCheckPublicEnabled } from "~/lib/sales-readiness.server";
import "~/public-website.css";
import "~/homepage-v7-realtor.css";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);
const PROPERTY_TYPES = new Set(["DETACHED_HOUSE", "SEMI_DETACHED_HOUSE", "TERRACED_HOUSE", "APARTMENT_BUILDING", "APARTMENT", "PENTHOUSE", "MAISONETTE", "LAND", "COMMERCIAL", "OFFICE", "RETAIL", "OTHER"]);
const SUPPORT = new Set(["ASSESSMENT", "COORDINATION", "DOCUMENTS", "MARKETING"]);
type ActionResult = { ok?: string; error?: string };
function text(fd: FormData, key: string, max = 4000) { return String(fd.get(key) ?? "").trim().replace(/\s+/g, " ").slice(0, max); }
function emailValid(value: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) && value.length <= 254; }

export function meta({ data: routeData }: Route.MetaArgs) {
  const canonicalUrl = (routeData as { canonicalUrl?: string } | undefined)?.canonicalUrl;
  return [
    { title: "Verkaufspotenzial prüfen · Verkaufsfertig-Check · ZeyherMutter" },
    { name: "description", content: "Vor der Vermarktung prüfen, welcher Verkaufsweg das Potenzial Ihrer Immobilie sinnvoll nutzt: Ist-Zustand, gezielte Aufbereitung oder erweiterte Maßnahmen." },
    { name: "robots", content: "index,follow" },
    ...(canonicalUrl ? [{ tagName: "link" as const, rel: "canonical", href: canonicalUrl }] : []),
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const localPreview = LOCAL_HOSTNAMES.has(url.hostname);
  return data({
    canonicalUrl: new URL("/verkaufsfertig-check", url.origin).toString(),
    localPreview,
    intakeEnabled: isSellerCheckPublicEnabled(context.cloudflare.env),
  }, { headers: { "Cache-Control": localPreview ? "private, no-store" : "public, max-age=120, s-maxage=600" } });
}

export async function action({ request, context }: Route.ActionArgs) {
  if (!isSellerCheckPublicEnabled(context.cloudflare.env)) return data<ActionResult>({ error: "Die Online-Anfrage ist derzeit nicht freigeschaltet." }, { status: 503 });
  const fd = await request.formData();
  if (text(fd, "company", 120)) return data<ActionResult>({ ok: "Vielen Dank. Ihre Anfrage wurde entgegengenommen." });

  const firstName = text(fd, "first_name", 100);
  const lastName = text(fd, "last_name", 100);
  const email = text(fd, "email", 254).toLowerCase();
  const phone = text(fd, "phone", 60);
  const postalCode = text(fd, "postal_code", 5);
  const city = text(fd, "city", 120);
  const propertyType = text(fd, "property_type", 40);
  const propertyCondition = text(fd, "property_condition", 160);
  const saleTimeframe = text(fd, "sale_timeframe", 160);
  const message = text(fd, "message", 4000);
  const requestedSupport = [...new Set(fd.getAll("requested_support").map(String).filter((value) => SUPPORT.has(value)))];
  const consent = fd.get("consent") === "on";
  if (!firstName || !lastName || !emailValid(email) || !/^\d{5}$/.test(postalCode) || city.length < 2 || !PROPERTY_TYPES.has(propertyType) || propertyCondition.length < 2 || saleTimeframe.length < 2 || !requestedSupport.length || !consent) {
    return data<ActionResult>({ error: "Bitte füllen Sie alle Pflichtfelder aus, wählen Sie mindestens eine Unterstützung und bestätigen Sie die Einwilligung." }, { status: 400 });
  }

  const env = context.cloudflare.env;
  const endpoint = `${env.SUPABASE_URL.replace(/\/$/, "")}/functions/v1/website-inquiry`;
  let edgeResponse: Response;
  try {
    edgeResponse = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: env.SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${env.SUPABASE_PUBLISHABLE_KEY}`,
      },
      body: JSON.stringify({
        kind: "SELLER_CHECK",
        first_name: firstName,
        last_name: lastName,
        email,
        phone,
        postal_code: postalCode,
        city,
        property_type: propertyType,
        property_condition: propertyCondition,
        sale_timeframe: saleTimeframe,
        requested_support: requestedSupport,
        message,
        consent: true,
        company: "",
        submission_key: `seller-${crypto.randomUUID()}`,
        source_url: new URL(request.url).pathname,
      }),
    });
  } catch {
    return data<ActionResult>({ error: "Die Anfrage konnte gerade nicht übermittelt werden. Bitte versuchen Sie es später erneut." }, { status: 502 });
  }
  const edgeBody = await edgeResponse.json().catch(() => ({})) as { ok?: boolean; error?: string };
  if (!edgeResponse.ok || edgeBody.ok !== true) {
    if (edgeResponse.status === 429) return data<ActionResult>({ error: "Zu viele Anfragen in kurzer Zeit. Bitte versuchen Sie es später erneut." }, { status: 429 });
    if (edgeResponse.status === 503) return data<ActionResult>({ error: "Die Online-Anfrage ist momentan nicht verfügbar. Bitte versuchen Sie es später erneut." }, { status: 503 });
    return data<ActionResult>({ error: "Die Anfrage konnte nicht verarbeitet werden. Bitte prüfen Sie Ihre Angaben." }, { status: 400 });
  }
  return data<ActionResult>({ ok: "Vielen Dank. Wir haben Ihre Anfrage erhalten und melden uns persönlich bei Ihnen." });
}

const scenarioCards = [
  ["01", "Verkauf im Ist-Zustand", "Was ist ohne zusätzliche Aufbereitung realistisch – und spricht wirtschaftlich etwas dagegen?"],
  ["02", "Gezielte Verkaufsaufbereitung", "Welche ausgewählten Maßnahmen können Präsentation und Verkaufsperspektive voraussichtlich sinnvoll stärken?"],
  ["03", "Erweiterte Maßnahmen", "Was wäre mit größerem Budget möglich – und steht der mögliche Nutzen noch in einem sinnvollen Verhältnis zum Aufwand?"],
] as const;
const measures = ["Entrümpelung & Entsorgung", "Reinigung", "Kleinere Reparaturen", "Malerarbeiten", "Boden & Parkett", "Garten & Außenbereich", "Möbelreduzierung & Styling", "Unterlagenbeschaffung", "Energieausweis", "Fotovorbereitung"];

export default function PublicSalesReadiness() {
  const { localPreview, intakeEnabled } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return <main className="public-site sales-check-page">
    <PublicHeader />
    <section className="sales-check-hero"><div><p className="public-eyebrow">Verkaufsfertig-Check · zusätzliche Option vor der Vermarktung</p><h1>Erst klären, was Ihre Immobilie braucht. Dann professionell verkaufen.</h1><p>Der Verkaufsfertig-Check ergänzt unsere klassische Maklerleistung, wenn vor dem Marktstart noch offen ist, ob die Immobilie direkt verkauft oder gezielt vorbereitet werden sollte. Wir vergleichen die realistischen Wege – und übernehmen anschließend auf Wunsch die Vermarktung und den Verkauf.</p><a className="public-primary-button dark" href="#anfrage">Verkaufsweg prüfen lassen</a></div><aside aria-label="Ziel des Verkaufsfertig-Checks"><span>Teil unseres Maklerprozesses</span><strong>Ist-Zustand prüfen</strong><strong>Aufbereitung abwägen</strong><strong>Aufwand einordnen</strong><strong>Danach vermarkten</strong></aside></section>
    <section className="sales-check-benefits public-story-section"><div><p className="public-eyebrow">Warum wir den Check machen</p><h2>Nicht möglichst viel renovieren. Sondern die richtigen Hebel vor dem Verkauf nutzen.</h2></div><div className="public-prose-large"><p>Der Check soll zeigen, ob und wo Vorbereitung vor dem Marktstart einen wirtschaftlich sinnvollen Unterschied machen kann. Dafür ordnen wir mögliche Maßnahmen fachlich ein und stellen drei nachvollziehbare Verkaufsszenarien gegenüber.</p><p><strong>Das Ergebnis:</strong> eine klare Grundlage dafür, wie Ihre Immobilie in den Markt gehen sollte – was Sie umsetzen, was optional bleibt und worauf Sie bewusst verzichten können.</p></div></section>
    <section className="sales-check-scenarios"><div className="public-section-head"><div><p className="public-eyebrow">Drei Verkaufswege</p><h2>Welcher Weg bietet das sinnvollste Verhältnis aus Aufwand, Zeit und Verkaufsperspektive?</h2></div></div><div className="sales-check-scenario-grid">{scenarioCards.map(([number,title,description])=><article key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div><p className="sales-check-estimate-note"><strong>Transparenz gehört dazu:</strong> Alle Preis- und Kostenspannen sind fachliche Einschätzungen und keine Garantie eines bestimmten Verkaufspreises.</p></section>
    <section className="sales-check-process"><div><p className="public-eyebrow">So wird daraus eine Verkaufsstrategie</p><h2>Verstehen. Vergleichen. Entscheiden. Verkaufsfertig vermarkten.</h2></div><ol><li><span>1</span><div><strong>Verkaufsziel klären</strong><p>Zeitplan, Budget, Ausgangssituation und gewünschtes Ergebnis verstehen.</p></div></li><li><span>2</span><div><strong>Immobilie und Marktauftritt prüfen</strong><p>Sichtbare Stärken, Hürden, Unterlagen und vermarktungsrelevante Punkte strukturiert erfassen.</p></div></li><li><span>3</span><div><strong>Verkaufswege gegeneinander abwägen</strong><p>Kostenkorridore, Zeitbedarf, Annahmen und mögliche Wirkung transparent machen.</p></div></li><li><span>4</span><div><strong>Den gewählten Weg umsetzen</strong><p>Ausgewählte Maßnahmen koordinieren und anschließend mit klarer Positionierung in die Vermarktung gehen.</p></div></li></ol></section>
    <section className="sales-check-measures"><div><p className="public-eyebrow">Mögliche Hebel</p><h2>Nur Maßnahmen, die zur Immobilie und zum Verkaufsziel passen.</h2><p>Ob Reinigung, Unterlagen, kleine Reparaturen oder stärkere Aufbereitung: empfohlen wird nicht, was machbar ist, sondern was voraussichtlich sinnvoll ist.</p></div><ul>{measures.map((measure)=><li key={measure}><span aria-hidden="true">✓</span>{measure}</li>)}</ul></section>
    <section className="sales-check-form-section" id="anfrage"><div className="sales-check-form-intro"><p className="public-eyebrow">Unverbindliche Anfrage</p><h2>Bevor Ihre Immobilie auf den Markt geht: Lassen Sie uns den sinnvollsten Verkaufsweg prüfen.</h2><p>Ihre Angaben werden ausschließlich zur Bearbeitung dieser Anfrage verarbeitet. Eine Zustimmung zu Werbung oder zur Nutzung von Fotos wird hiermit nicht erteilt.</p>{intakeEnabled ? <div className="public-preview-safety"><strong>BETA-Formular aktiv</strong><span>Die Anfrage wird sicher als Verkäufer-Lead im BETA-CRM erfasst.</span></div> : <div className="public-preview-safety"><strong>Online-Anfrage derzeit deaktiviert</strong><span>Es erfolgt keine Übertragung.</span></div>}{localPreview ? <Link className="public-secondary-link" to="/__preview/sales-readiness">Lokale Vorschau öffnen →</Link> : null}</div>
      <div className="public-contact-form-card"><Form method="post" className="public-inquiry-form" replace>{result?.error ? <div className="form-error">{result.error}</div> : null}{result?.ok ? <div className="success-banner">{result.ok}</div> : null}<div className="public-form-grid"><label><span>Vorname *</span><input name="first_name" autoComplete="given-name" required/></label><label><span>Nachname *</span><input name="last_name" autoComplete="family-name" required/></label></div><div className="public-form-grid"><label><span>E-Mail *</span><input name="email" type="email" autoComplete="email" required/></label><label><span>Telefon <small>(optional)</small></span><input name="phone" type="tel" autoComplete="tel"/></label></div><div className="public-form-grid"><label><span>PLZ *</span><input name="postal_code" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" required/></label><label><span>Ort *</span><input name="city" autoComplete="address-level2" required/></label></div><div className="public-form-grid"><label><span>Immobilienart *</span><select name="property_type" defaultValue="" required><option value="" disabled>Bitte auswählen</option><option value="DETACHED_HOUSE">Einfamilienhaus</option><option value="SEMI_DETACHED_HOUSE">Doppelhaushälfte</option><option value="TERRACED_HOUSE">Reihenhaus</option><option value="APARTMENT">Wohnung</option><option value="APARTMENT_BUILDING">Mehrfamilienhaus</option><option value="LAND">Grundstück</option><option value="COMMERCIAL">Gewerbeimmobilie</option><option value="OTHER">Sonstiges</option></select></label><label><span>Grober Zustand *</span><select name="property_condition" defaultValue="" required><option value="" disabled>Bitte auswählen</option><option value="Gepflegt">Gepflegt</option><option value="Leicht renovierungsbedürftig">Leicht renovierungsbedürftig</option><option value="Deutlich renovierungsbedürftig">Deutlich renovierungsbedürftig</option><option value="Sanierungsbedürftig">Sanierungsbedürftig</option><option value="Noch unklar">Noch unklar</option></select></label></div><label><span>Gewünschter Verkaufszeitraum *</span><select name="sale_timeframe" defaultValue="" required><option value="" disabled>Bitte auswählen</option><option>So bald wie möglich</option><option>In 3 bis 6 Monaten</option><option>In 6 bis 12 Monaten</option><option>Später / noch offen</option></select></label><fieldset className="sales-check-support"><legend>Benötigte Unterstützung *</legend><label><input type="checkbox" name="requested_support" value="ASSESSMENT"/> Einschätzung sinnvoller Maßnahmen</label><label><input type="checkbox" name="requested_support" value="COORDINATION"/> Koordination der Vorbereitung</label><label><input type="checkbox" name="requested_support" value="DOCUMENTS"/> Unterlagenbeschaffung</label><label><input type="checkbox" name="requested_support" value="MARKETING"/> Vermarktung und Verkauf</label></fieldset><label><span>Nachricht</span><textarea name="message" rows={5} maxLength={4000} placeholder="Was sollten wir über die Immobilie und Ihre Situation wissen?"/></label><label className="public-honeypot" aria-hidden="true"><span>Firma</span><input name="company" tabIndex={-1} autoComplete="off"/></label><label className="public-consent light"><input type="checkbox" name="consent" required/><span>Ich stimme zu, dass meine Angaben zur Bearbeitung dieser Anfrage gespeichert und verarbeitet werden. *</span></label><button className="public-primary-button dark" type="submit" disabled={!intakeEnabled}>Anfrage senden</button></Form></div>
    </section>
    <section className="public-faq-section sales-check-faq"><div><p className="public-eyebrow">FAQ</p><h2>Was Eigentümer vorher wissen möchten.</h2></div><div className="public-faq-list"><details><summary>Was ist das eigentliche Ziel des Checks?</summary><p>Vor der Vermarktung herauszufinden, welcher Verkaufsweg für Ihre Immobilie voraussichtlich am sinnvollsten ist. Der Check soll unnötige Ausgaben vermeiden und gleichzeitig mögliche Hebel für Marktauftritt und Verkaufsperspektive sichtbar machen.</p></details><details><summary>Kann das Ergebnis auch „im Ist-Zustand verkaufen“ lauten?</summary><p>Ja. Der Verkauf im Ist-Zustand ist ausdrücklich eines der drei Szenarien. Wenn zusätzliche Maßnahmen wirtschaftlich oder zeitlich nicht sinnvoll erscheinen, wird das transparent so empfohlen.</p></details><details><summary>Garantiert der Check einen höheren Verkaufspreis?</summary><p>Nein. Marktreaktion und Verkaufspreis lassen sich nicht garantieren. Der Check schafft eine fundierte Entscheidungsgrundlage für die Vorbereitung und Positionierung vor der Vermarktung.</p></details><details><summary>Entstehen durch die Anfrage Kosten?</summary><p>Nein. Die Anfrage ist unverbindlich und löst keine Beauftragung aus.</p></details></div></section>
    <PublicFooter />
  </main>;
}
