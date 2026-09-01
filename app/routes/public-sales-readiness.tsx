import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/public-sales-readiness";
import { PublicFooter, PublicHeader } from "~/components/public-shell";
import "~/public-website.css";

const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function meta({ data: routeData }: Route.MetaArgs) {
  const canonicalUrl = (routeData as { canonicalUrl?: string } | undefined)?.canonicalUrl;
  return [
    { title: "Verkaufsfertig-Check für Immobilien · ZeyherMutter" },
    { name: "description", content: "Drei Verkaufsszenarien vergleichen, sinnvolle Maßnahmen erkennen und Vorbereitung, Vermarktung und Verkauf strukturiert organisieren." },
    { name: "robots", content: "index,follow" },
    ...(canonicalUrl ? [{ tagName: "link" as const, rel: "canonical", href: canonicalUrl }] : []),
  ];
}

export async function loader({ request }: Route.LoaderArgs) {
  const url = new URL(request.url);
  return data(
    {
      canonicalUrl: new URL("/verkaufsfertig-check", url.origin).toString(),
      localPreview: LOCAL_HOSTNAMES.has(url.hostname),
    },
    { headers: { "Cache-Control": LOCAL_HOSTNAMES.has(url.hostname) ? "private, no-store" : "public, max-age=300, s-maxage=1800" } },
  );
}

const scenarioCards = [
  ["01", "Verkauf im Ist-Zustand", "Welche Vermarktung ist ohne zusätzliche Aufbereitung realistisch?"],
  ["02", "Empfohlene Verkaufsaufbereitung", "Welche ausgewählten Maßnahmen stehen voraussichtlich in einem sinnvollen Verhältnis zu Aufwand, Zeit und Wirkung?"],
  ["03", "Erweiterte Maßnahmen", "Was wäre mit größerem Budget und zusätzlichem Zeitbedarf möglich – und ist das für Ihr Ziel überhaupt sinnvoll?"],
] as const;

const measures = ["Entrümpelung & Entsorgung", "Reinigung", "Kleinere Reparaturen", "Malerarbeiten", "Boden & Parkett", "Garten & Außenbereich", "Möbelreduzierung & Styling", "Unterlagenbeschaffung", "Energieausweis", "Fotovorbereitung"];

export default function PublicSalesReadiness() {
  const { localPreview } = useLoaderData<typeof loader>();
  return (
    <main className="public-site sales-check-page">
      <PublicHeader />
      <section className="sales-check-hero">
        <div>
          <p className="public-eyebrow">Verkaufsfertig-Check</p>
          <h1>Bevor Sie investieren, vergleichen wir die sinnvollen Wege.</h1>
          <p>Wir zeigen Ihnen, was sich vor dem Verkauf wirklich lohnt – und kümmern uns anschließend um Vorbereitung, Vermarktung und Verkauf.</p>
          <a className="public-primary-button dark" href="#anfrage">Unverbindlich anfragen</a>
        </div>
        <aside aria-label="Leistungsumfang">
          <span>Ein strukturierter Blick auf</span>
          <strong>Ausgangslage</strong><strong>Investition</strong><strong>Zeitbedarf</strong><strong>Vermarktung</strong>
        </aside>
      </section>

      <section className="sales-check-benefits public-story-section">
        <div><p className="public-eyebrow">Ihr Nutzen</p><h2>Eine Entscheidungsvorlage statt einer pauschalen Renovierungsliste.</h2></div>
        <div className="public-prose-large"><p>Nach der Besichtigung ordnen wir mögliche Maßnahmen fachlich ein, dokumentieren Annahmen und Unsicherheiten und stellen drei nachvollziehbare Verkaufsszenarien gegenüber.</p><p>Sie erhalten eine klare Grundlage dafür, was Sie umsetzen, was optional bleibt und worauf Sie bewusst verzichten können.</p></div>
      </section>

      <section className="sales-check-scenarios">
        <div className="public-section-head"><div><p className="public-eyebrow">Drei Szenarien</p><h2>Nicht nur einen Weg betrachten.</h2></div></div>
        <div className="sales-check-scenario-grid">{scenarioCards.map(([number, title, description]) => <article key={number}><span>{number}</span><h3>{title}</h3><p>{description}</p></article>)}</div>
        <p className="sales-check-estimate-note"><strong>Transparenz gehört dazu:</strong> Alle Preis- und Kostenspannen sind fachliche Einschätzungen auf Basis der verfügbaren Informationen und keine Garantie eines bestimmten Verkaufspreises.</p>
      </section>

      <section className="sales-check-process">
        <div><p className="public-eyebrow">So läuft der Check ab</p><h2>Besichtigen. Vergleichen. Entscheiden. Umsetzen.</h2></div>
        <ol><li><span>1</span><div><strong>Ihre Ziele klären</strong><p>Zeitplan, Budget, Ausgangssituation und gewünschte Unterstützung verstehen.</p></div></li><li><span>2</span><div><strong>Immobilie ansehen</strong><p>Sichtbare Stärken, Hürden, Unterlagen und Vermarktungsrelevanz strukturiert erfassen.</p></div></li><li><span>3</span><div><strong>Szenarien und Maßnahmen einordnen</strong><p>Kostenkorridore, Zeitbedarf, Annahmen und Einschätzungssicherheit transparent machen.</p></div></li><li><span>4</span><div><strong>Den passenden Weg organisieren</strong><p>Ausgewählte Maßnahmen koordinieren und anschließend die Vermarktung starten.</p></div></li></ol>
      </section>

      <section className="sales-check-measures">
        <div><p className="public-eyebrow">Beispielhafte Maßnahmen</p><h2>Von Unterlagen bis Fotovorbereitung.</h2><p>Welche Schritte sinnvoll sind, hängt von Immobilie, Zielgruppe und Zeitplan ab.</p></div>
        <ul>{measures.map((measure) => <li key={measure}><span aria-hidden="true">✓</span>{measure}</li>)}</ul>
      </section>

      <section className="sales-check-roles">
        <article><p className="public-eyebrow">ZeyherMutter</p><h3>Beraten und koordinieren</h3><p>Wir bewerten die Optionen im Kontext des Verkaufs, bereiten die Entscheidung vor und koordinieren vereinbarte Schritte.</p></article>
        <article><p className="public-eyebrow">Partnerbetriebe</p><h3>Fachgerecht ausführen</h3><p>Handwerkliche und zulassungspflichtige Leistungen werden ausschließlich durch geeignete, separat beauftragte Partnerbetriebe ausgeführt.</p></article>
        <article><p className="public-eyebrow">Sie als Eigentümer</p><h3>Entscheiden</h3><p>Sie bestimmen Budget, Umfang und Zeitplan. Keine Maßnahme wird ohne Ihre Entscheidung beauftragt.</p></article>
      </section>

      <section className="sales-check-form-section" id="anfrage">
        <div className="sales-check-form-intro">
          <p className="public-eyebrow">Anfrage vorbereiten</p>
          <h2>Erzählen Sie uns kurz von Ihrer Immobilie.</h2>
          <p>Das Formular ist für die Sichtprüfung vollständig gestaltet. Die technische Übermittlung wird erst nach der gesonderten Backend-Freigabe aktiviert.</p>
          <div className="public-preview-safety"><strong>Vorschau – noch keine Übermittlung</strong><span>Ihre Eingaben werden weder gespeichert noch an BETA oder PROD gesendet.</span></div>
          {localPreview ? <Link className="public-secondary-link" to="/__preview/sales-readiness">Lokale CRM-Vorschau öffnen →</Link> : null}
        </div>
        <div className="public-contact-form-card" role="form" aria-labelledby="seller-check-form-heading">
          <h3 id="seller-check-form-heading" className="sr-only">Anfrageformular Verkaufsfertig-Check</h3>
          <div className="public-inquiry-form">
            <div className="public-form-grid"><label><span>Vorname *</span><input name="first_name" autoComplete="given-name" /></label><label><span>Nachname *</span><input name="last_name" autoComplete="family-name" /></label></div>
            <div className="public-form-grid"><label><span>E-Mail *</span><input name="email" type="email" autoComplete="email" /></label><label><span>Telefon <small>(optional)</small></span><input name="phone" type="tel" autoComplete="tel" /></label></div>
            <div className="public-form-grid"><label><span>PLZ *</span><input name="postal_code" inputMode="numeric" autoComplete="postal-code" /></label><label><span>Ort *</span><input name="city" autoComplete="address-level2" /></label></div>
            <div className="public-form-grid"><label><span>Immobilienart *</span><select name="property_type" defaultValue=""><option value="" disabled>Bitte auswählen</option><option value="DETACHED_HOUSE">Haus</option><option value="APARTMENT">Wohnung</option><option value="APARTMENT_BUILDING">Mehrfamilienhaus</option><option value="LAND">Grundstück</option><option value="COMMERCIAL">Gewerbeimmobilie</option><option value="OTHER">Sonstiges</option></select></label><label><span>Grober Zustand *</span><select name="property_condition" defaultValue=""><option value="" disabled>Bitte auswählen</option><option value="Gepflegt">Gepflegt</option><option value="Leicht renovierungsbedürftig">Leicht renovierungsbedürftig</option><option value="Deutlich renovierungsbedürftig">Deutlich renovierungsbedürftig</option><option value="Sanierungsbedürftig">Sanierungsbedürftig</option><option value="Noch unklar">Noch unklar</option></select></label></div>
            <label><span>Gewünschter Verkaufszeitraum *</span><select name="sale_timeframe" defaultValue=""><option value="" disabled>Bitte auswählen</option><option>So bald wie möglich</option><option>In 3 bis 6 Monaten</option><option>In 6 bis 12 Monaten</option><option>Später / noch offen</option></select></label>
            <fieldset className="sales-check-support"><legend>Benötigte Unterstützung</legend><label><input type="checkbox" name="requested_support" value="ASSESSMENT" /> Einschätzung sinnvoller Maßnahmen</label><label><input type="checkbox" name="requested_support" value="COORDINATION" /> Koordination der Vorbereitung</label><label><input type="checkbox" name="requested_support" value="DOCUMENTS" /> Unterlagenbeschaffung</label><label><input type="checkbox" name="requested_support" value="MARKETING" /> Vermarktung und Verkauf</label></fieldset>
            <label><span>Nachricht</span><textarea name="message" rows={5} maxLength={4000} placeholder="Was sollten wir über die Immobilie und Ihre Situation wissen?" /></label>
            <label className="public-honeypot" aria-hidden="true"><span>Firma</span><input name="company" tabIndex={-1} autoComplete="off" /></label>
            <label className="public-consent light"><input type="checkbox" name="consent" /><span>Ich stimme zu, dass meine Angaben nach Freischaltung zur Bearbeitung der Anfrage gespeichert und verarbeitet werden. *</span></label>
            <button className="public-primary-button dark" type="button" disabled aria-describedby="seller-check-disabled-note">Anfrage senden</button>
            <small id="seller-check-disabled-note" className="sales-check-disabled-note">Übermittlung in dieser Vorschau bewusst deaktiviert.</small>
          </div>
        </div>
      </section>

      <section className="public-faq-section sales-check-faq">
        <div><p className="public-eyebrow">FAQ</p><h2>Was Eigentümer vorher wissen möchten.</h2></div>
        <div className="public-faq-list"><details><summary>Was bekomme ich nach dem Check?</summary><p>Eine strukturierte Einordnung der Ausgangslage, drei vergleichbare Verkaufsszenarien und eine priorisierte Liste möglicher Maßnahmen mit Annahmen und Unsicherheiten.</p></details><details><summary>Kann ich auch im Ist-Zustand verkaufen?</summary><p>Ja. Der Verkauf im Ist-Zustand ist ausdrücklich eines der drei Szenarien und kann je nach Ziel, Zeitplan und Immobilie der passende Weg sein.</p></details><details><summary>Beauftragt ZeyherMutter Handwerksarbeiten?</summary><p>Nur nach Ihrer Entscheidung kann eine Koordination erfolgen. Ausgeführt werden solche Arbeiten durch geeignete Partnerbetriebe, nicht durch ZeyherMutter selbst.</p></details><details><summary>Entstehen durch diese Vorschauseite Kosten?</summary><p>Nein. Das Formular übermittelt aktuell nichts und löst keine Beauftragung aus.</p></details></div>
      </section>
      <PublicFooter />
    </main>
  );
}
