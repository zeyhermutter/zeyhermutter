import { data, Form, Link, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/public-measurement";
import { seitenkopf } from "~/lib/seitenkopf";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Honigtopf, PublicFooter, PublicHeader } from "~/components/public-shell";
import { AUFMASSPAKET } from "~/lib/labels";
import { AUFMASSPAKETE, AUFMASSPAKET_SCHLUESSEL, HONIGTOPF_FELD, IMMOBILIENARTEN, IMMOBILIENARTEN_SCHLUESSEL } from "~/lib/public-intake";
import {
  aufnahmewegOffen, einsendeSchluessel, epostGueltig, sendeAufnahme, textFeld, zahlFeld,
} from "~/lib/public-intake.server";
import "~/public-website.css";

// Technisches Immobilienaufmass -- die zweite Leistung neben der Vermittlung.
//
// WARUM HIER PREISE STEHEN UND SONST NIRGENDS AUF DIESER WEBSITE
//
// Keine andere oeffentliche Seite nennt einen Betrag; beim Verkaufsstrategie-
// Check steht sogar ausdruecklich, dass jede Spanne eine Einschaetzung ist.
// Das passt dort, weil der Preis einer Vermittlung vom Objekt abhaengt.
//
// Ein Aufmass ist das Gegenteil: eine abgegrenzte Leistung mit einem Umfang,
// den man vorher beschreiben kann. Wer einen Grundriss braucht, vergleicht
// Preise -- und eine Seite ohne Zahl zwingt ihn, erst anzufragen, um zu
// erfahren, ob es ueberhaupt in Frage kommt. Die Zahlen sind deshalb
// Einstiegspreise mit ausdruecklicher Grenze ("bis 100 m2"), nicht Festpreise
// fuer jeden Fall; darueber steht, was den Preis bewegt.
//
// Der Umsatzsteuerzusatz steht an JEDER Zahl und nicht nur einmal unter dem
// Raster. Eine Preisangabe wird gelesen, wo sie steht -- wer die Karte
// "399 EUR bis 100 m2" ueberfliegt, scrollt nicht erst zur Fussnote.
//
// WAS DIESE SEITE NICHT TUT
//
// Sie rechnet nichts aus und verspricht keine behoerdliche Anerkennung. Der
// Hinweisblock am Ende grenzt ab, was eine fachlich erstellte Unterlage ist
// und was eine behoerdlich bestaetigte waere. Der Text dazu stammt vom
// Anbieter und ist hier nicht erfunden worden.

type ActionResult = { ok?: string; error?: string };

/** Was in einem Paket steckt. Die Reihenfolge ist die der Darstellung. */
const PAKETE: { schluessel: string; preis: string; einleitung: string; leistungen: string[]; hinweis?: string }[] = [
  {
    schluessel: "FLOOR_PLAN_REFRESH",
    preis: "ab 149 €",
    einleitung: "Sie haben bereits einen Grundriss, brauchen ihn aber in einer modernen, übersichtlichen Darstellung.",
    leistungen: ["Neuzeichnung vorhandener Unterlagen", "Raumbezeichnungen", "Übersichtliche 2D-Darstellung", "PDF- und Exposé-Version"],
    hinweis: "Grundlage sind die zur Verfügung gestellten Bestandsunterlagen. Ohne Vor-Ort-Aufmaß.",
  },
  {
    schluessel: "AS_BUILT",
    preis: "399 € bis 100 m²",
    einleitung: "Wir messen Ihre Immobilie vor Ort auf und erstellen einen aktuellen Bestandsgrundriss.",
    leistungen: ["Örtliches Aufmaß", "Maßstäblicher Bestandsgrundriss", "Bemaßung", "Raumbezeichnungen", "Flächenangaben", "Technische PDF-Ausfertigung"],
    hinweis: "Für fehlende, veraltete oder nicht mehr zum tatsächlichen Bestand passende Grundrisse.",
  },
  {
    schluessel: "SALE_FINANCE",
    preis: "549 € bis 100 m²",
    einleitung: "Das Komplettpaket für Eigentümer, Käufer und Verkäufer.",
    leistungen: [
      "Örtliches Aufmaß", "Bemaßter Bestandsgrundriss", "Wohnflächenberechnung nach WoFlV",
      "Flächenübersicht je Raum", "Technischer Grundriss", "Zusätzlicher Grundriss fürs Exposé",
      "Dokumentation der Mess- und Berechnungsgrundlage", "Prüfung und Unterzeichnung durch einen Vermessungsingenieur",
    ],
  },
  {
    schluessel: "HOUSE_PREMIUM",
    preis: "ab 899 €",
    einleitung: "Für Einfamilienhäuser und Immobilien mit mehreren Geschossen.",
    leistungen: [
      "Vollständiges Vor-Ort-Aufmaß", "Bestandsgrundrisse sämtlicher Geschosse",
      "Wohnflächenberechnung nach WoFlV", "Zusätzliche Flächenübersicht",
      "Auf Wunsch Flächenberechnung nach DIN 277", "Technische Grundrisse", "Exposé-Grundrisse",
      "Zusammenfassende Objektdokumentation", "Prüfung und Unterzeichnung durch einen Vermessungsingenieur",
    ],
  },
];

const ABLAUF: [string, string][] = [
  ["Anfrage", "Sie nennen Paket, Objektart und ungefähre Größe. Wir melden uns mit einem verbindlichen Preis für genau Ihren Fall."],
  ["Termin", "Für alle Pakete mit Vor-Ort-Aufmaß vereinbaren wir einen Termin. Gerechnet wird mit ein bis drei Stunden vor Ort, je nach Größe."],
  ["Aufmaß", "Wir erfassen die Immobilie raumweise, mit Laserdistanzmessung und Aufmaßskizze."],
  ["Ausarbeitung", "Aus den Messwerten entstehen der maßstäbliche Grundriss und — je nach Paket — die Wohnflächenberechnung."],
  ["Lieferung", "Sie erhalten die Unterlagen als PDF: den technischen Grundriss, den Exposé-Grundriss und die Flächenübersicht."],
];

const FRAGEN: [string, string][] = [
  ["Wie lange dauert das Aufmaß vor Ort?", "Für eine Wohnung bis 100 m² rund eine Stunde, für ein Einfamilienhaus mit mehreren Geschossen zwei bis drei Stunden. Sie müssen nichts vorbereiten; alle Räume sollten zugänglich sein."],
  ["Wann sind die Unterlagen fertig?", "In der Regel innerhalb weniger Werktage nach dem Termin. Wenn es eilt, sagen Sie es bei der Anfrage — wir sagen Ihnen dann, was möglich ist."],
  ["Was ist der Unterschied zwischen WoFlV und DIN 277?", "Die Wohnflächenverordnung ist die übliche Grundlage für Wohnimmobilien und rechnet etwa Dachschrägen und Balkone nur anteilig an. Die DIN 277 erfasst Grundflächen des Bauwerks und kommt auf andere Zahlen. Welche Grundlage gilt, steht in der Berechnung ausdrücklich dabei."],
  ["Muss ich bei Ihnen verkaufen, um das zu beauftragen?", "Nein. Das Aufmaß ist eine eigenständige Leistung. Sie können es beauftragen, ohne dass ein Verkauf ansteht oder ein Maklerauftrag besteht."],
  ["Gilt der Preis auch für größere Objekte?", "Die genannten Preise gelten für die beschriebenen Leistungen in den angegebenen Grenzen. Größere Objekte, mehrere Einheiten, weite Anfahrt oder besondere Anforderungen rechnen wir nach Aufwand ab — den Preis nennen wir vor der Beauftragung."],
  ["Sind die Preise mit oder ohne Umsatzsteuer?", "Alle genannten Beträge sind Nettopreise zuzüglich der gesetzlichen Umsatzsteuer. Im Angebot, das Sie vor der Beauftragung erhalten, stehen Netto- und Bruttobetrag nebeneinander."],
];

function seitenMeta({ data: routeData }: Route.MetaArgs) {
  const canonicalUrl = (routeData as { canonicalUrl?: string } | undefined)?.canonicalUrl;
  return [
    { title: "Technisches Immobilienaufmaß · Grundrisse und Wohnflächenberechnung · ZeyherMutter" },
    { name: "description", content: "Bestandsgrundrisse und Wohnflächenberechnung nach WoFlV vom Vermessungsingenieur. Grundriss-Refresh ab 149 €, Bestandsaufmaß ab 399 € — jeweils netto zzgl. USt." },
    { name: "robots", content: "index,follow" },
    ...(canonicalUrl ? [{ tagName: "link" as const, rel: "canonical", href: canonicalUrl }] : []),
  ];
}

export function meta(args: Route.MetaArgs) {
  return seitenkopf(args, seitenMeta(args));
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { supabase } = createSupabaseServerClient(request, context.cloudflare.env);
  const offen = await aufnahmewegOffen(supabase, "MEASUREMENT");
  return data({ canonicalUrl: new URL("/technisches-aufmass", url.origin).toString(), offen },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=120" } });
}

export async function action({ request, context }: Route.ActionArgs) {
  const fd = await request.formData();
  if (textFeld(fd, HONIGTOPF_FELD, 120)) return data<ActionResult>({ ok: "Vielen Dank. Ihre Anfrage wurde entgegengenommen." });

  const vorname = textFeld(fd, "first_name", 100);
  const nachname = textFeld(fd, "last_name", 100);
  const epost = textFeld(fd, "email", 254).toLowerCase();
  const telefon = textFeld(fd, "phone", 60);
  const plz = textFeld(fd, "postal_code", 5);
  const ort = textFeld(fd, "city", 120);
  const paket = textFeld(fd, "service_package", 40);
  const art = textFeld(fd, "property_type", 40);
  const flaeche = zahlFeld(fd, "approx_area_sqm");
  const geschosse = zahlFeld(fd, "floor_count");
  const nachricht = textFeld(fd, "message", 4000);
  const einwilligung = fd.get("consent") === "on";

  if (!vorname || !nachname || !epostGueltig(epost) || !/^\d{5}$/.test(plz) || ort.length < 2
      || !AUFMASSPAKET_SCHLUESSEL.has(paket) || !IMMOBILIENARTEN_SCHLUESSEL.has(art) || !einwilligung) {
    return data<ActionResult>({ error: "Bitte füllen Sie alle Pflichtfelder aus und bestätigen Sie die Einwilligung." }, { status: 400 });
  }

  const ergebnis = await sendeAufnahme(context.cloudflare.env, {
    kind: "MEASUREMENT",
    first_name: vorname, last_name: nachname, email: epost, phone: telefon,
    postal_code: plz, city: ort,
    service_package: paket, property_type: art,
    approx_area_sqm: flaeche, floor_count: geschosse !== null ? Math.round(geschosse) : null,
    message: nachricht, consent: true, company: "",
    submission_key: einsendeSchluessel("aufmass"),
    source_url: new URL(request.url).pathname,
  });
  if (!ergebnis.ok) return data<ActionResult>({ error: ergebnis.meldung }, { status: ergebnis.status });
  return data<ActionResult>({ ok: "Vielen Dank. Wir melden uns mit einem verbindlichen Preis für Ihren Fall." });
}

export default function PublicMeasurement() {
  const { offen } = useLoaderData<typeof loader>();
  const ergebnis = useActionData<typeof action>();

  return <main className="public-site">
    <PublicHeader />

    <section className="sales-check-hero">
      <div>
        <p className="public-eyebrow">Technisches Immobilienaufmaß</p>
        <h1>Präzise Immobilienunterlagen aus einer Hand</h1>
        <p>Als Vermessungsingenieur und Immobilienmakler verbinde ich professionelle Immobilienvermarktung mit technischem Fachwissen. Grundrisse und Wohnflächen kommen damit nicht von einem Dienstleister, der die Immobilie nie gesehen hat.</p>
        <a className="public-primary-button dark" href="#anfrage">Aufmaß anfragen</a>
      </div>
      <aside>
        <span>Was Sie bekommen</span>
        <strong>Maßstäblicher Bestandsgrundriss</strong>
        <strong>Wohnflächenberechnung nach WoFlV</strong>
        <strong>Grundriss für das Exposé</strong>
        <strong>Geprüft und unterzeichnet</strong>
      </aside>
    </section>

    <section className="public-story-section">
      <div>
        <p className="public-eyebrow">Warum das zählt</p>
        <h2>Veraltete Grundrisse kosten Zeit — meist genau dann, wenn keine ist.</h2>
      </div>
      <div className="public-prose-large">
        <p>Unklare Wohnflächen oder fehlende Maßangaben führen bei Verkauf und Finanzierung zu Rückfragen: von der Bank, vom Käufer, vom Sachverständigen. Diese Rückfragen kommen regelmäßig spät, wenn der Zeitplan schon steht.</p>
        <p><strong>Deshalb erfassen wir die Immobilie auf Wunsch direkt vor Ort</strong> und erstellen daraus nachvollziehbare technische Unterlagen — mit der Grundlage, auf der sie beruhen, schriftlich dabei.</p>
      </div>
    </section>

    <section className="aufmass-pakete" id="pakete">
      <div className="public-section-head">
        <div>
          <p className="public-eyebrow">Pakete</p>
          <h2>Vier Umfänge, ein Ergebnis</h2>
        </div>
      </div>
      <div className="aufmass-paket-grid">
        {PAKETE.map((paket) => <article key={paket.schluessel}>
          <span className="aufmass-paket-name">{AUFMASSPAKET[paket.schluessel]}</span>
          <strong className="aufmass-preis">{paket.preis}</strong>
          <small className="aufmass-preis-zusatz">zzgl. gesetzlicher Umsatzsteuer</small>
          <p>{paket.einleitung}</p>
          <ul>
            {paket.leistungen.map((leistung) => <li key={leistung}><span aria-hidden="true">✓</span>{leistung}</li>)}
          </ul>
          {paket.hinweis ? <small className="aufmass-paket-hinweis">{paket.hinweis}</small> : null}
        </article>)}
      </div>
      <p className="sales-check-estimate-note">
        <strong>Was die Preise bedeuten:</strong> Alle genannten Beträge sind Nettopreise und verstehen sich zuzüglich der
        gesetzlichen Umsatzsteuer. Sie gelten für die beschriebenen Leistungen in den angegebenen Grenzen. Größere Objekte,
        mehrere Einheiten, weite Anfahrt oder besondere Anforderungen rechnen wir nach Aufwand ab — den Preis für Ihren Fall
        nennen wir vor der Beauftragung.
      </p>
    </section>

    <section className="sales-check-process">
      <div>
        <p className="public-eyebrow">Ablauf</p>
        <h2>Von der Anfrage bis zur Unterlage</h2>
      </div>
      <ol>
        {ABLAUF.map(([titel, text], index) => <li key={titel}>
          <span>{index + 1}</span>
          <div><strong>{titel}</strong><p>{text}</p></div>
        </li>)}
      </ol>
    </section>

    <section className="public-story-section">
      <div>
        <p className="public-eyebrow">Vor der Vermarktung</p>
        <h2>Erst Klarheit über die Flächen, dann der Preis.</h2>
      </div>
      <div className="public-prose-large">
        <p>Besonders bei älteren Immobilien stimmen vorhandene Bauzeichnungen und tatsächlicher Bestand nicht immer überein. Ausgebaute Dachgeschosse, versetzte Wände, angebaute Wintergärten — all das steht selten in den Unterlagen von damals.</p>
        <p>Ein aktuelles Aufmaß schafft vor der Vermarktung Klarheit über Grundriss, Raumaufteilung und Flächen. Eigentümer, Kaufinteressenten und Finanzierungspartner arbeiten danach mit derselben Zahl — und die Zahl hat eine Herkunft, die man nachlesen kann.</p>
      </div>
    </section>

    <section className="aufmass-hinweis">
      <div className="public-preview-safety">
        <strong>Wichtiger Hinweis</strong>
        <span>
          Unsere Bestandsgrundrisse und Flächenberechnungen sind fachlich erstellte technische Unterlagen. Sie ersetzen
          keine behördliche Genehmigung, amtliche Beglaubigung, Abgeschlossenheitsbescheinigung oder einen behördlich
          bestätigten Aufteilungsplan, sofern ein solcher für den jeweiligen Vorgang gesetzlich erforderlich ist. Ob im
          Einzelfall zusätzliche oder behördlich bestätigte Unterlagen nötig sind, richtet sich nach den Anforderungen
          der jeweiligen Stelle, bei der sie vorgelegt werden.
        </span>
      </div>
    </section>

    <section className="public-faq-section sales-check-faq">
      <div className="public-section-head">
        <div>
          <p className="public-eyebrow">Fragen</p>
          <h2>Was Eigentümer vorher wissen wollen</h2>
        </div>
      </div>
      <div className="public-faq-list">
        {FRAGEN.map(([frage, antwort]) => <details key={frage}>
          <summary>{frage}</summary>
          <p>{antwort}</p>
        </details>)}
      </div>
    </section>

    <section className="sales-check-form-section" id="anfrage">
      <div className="sales-check-form-intro">
        <p className="public-eyebrow">Unverbindlich</p>
        <h2>Aufmaß anfragen</h2>
        <p>Sagen Sie uns, welches Paket in Frage kommt und um welche Immobilie es geht. Sie bekommen einen verbindlichen Preis, bevor Sie sich entscheiden.</p>
        {offen ? null : (
          <div className="public-preview-safety">
            <strong>Das Formular ist derzeit geschlossen</strong>
            <span>Es nimmt gerade keine Anfragen entgegen. Schreiben Sie uns bitte über die Kontaktseite — wir melden uns genauso.</span>
          </div>
        )}
      </div>

      <div className="public-contact-form-card">
        {ergebnis?.ok ? (
          <div className="public-form-success"><strong>Vielen Dank.</strong><span>{ergebnis.ok}</span></div>
        ) : (
          <Form method="post" className="public-inquiry-form" replace>
            {ergebnis?.error ? <div className="public-form-message">{ergebnis.error}</div> : null}
            <label><span>Paket *</span>
              <select name="service_package" defaultValue="" required disabled={!offen}>
                <option value="" disabled>Bitte auswählen</option>
                {AUFMASSPAKETE.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <div className="public-form-grid">
              <label><span>Vorname *</span><input name="first_name" autoComplete="given-name" required disabled={!offen} /></label>
              <label><span>Nachname *</span><input name="last_name" autoComplete="family-name" required disabled={!offen} /></label>
            </div>
            <div className="public-form-grid">
              <label><span>E-Mail *</span><input name="email" type="email" autoComplete="email" required disabled={!offen} /></label>
              <label><span>Telefon <small>(optional)</small></span><input name="phone" type="tel" autoComplete="tel" disabled={!offen} /></label>
            </div>
            <div className="public-form-grid">
              <label><span>PLZ *</span><input name="postal_code" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" required disabled={!offen} /></label>
              <label><span>Ort *</span><input name="city" autoComplete="address-level2" required disabled={!offen} /></label>
            </div>
            <label><span>Immobilienart *</span>
              <select name="property_type" defaultValue="" required disabled={!offen}>
                <option value="" disabled>Bitte auswählen</option>
                {IMMOBILIENARTEN.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>
            <div className="public-form-grid">
              <label><span>Ungefähre Fläche in m² <small>(optional)</small></span><input name="approx_area_sqm" inputMode="numeric" maxLength={6} disabled={!offen} /></label>
              <label><span>Geschosse <small>(optional)</small></span><input name="floor_count" inputMode="numeric" maxLength={2} disabled={!offen} /></label>
            </div>
            <label><span>Nachricht <small>(optional)</small></span>
              <textarea name="message" rows={4} maxLength={4000} placeholder="Liegen Bestandsunterlagen vor? Gibt es einen Termindruck?" disabled={!offen} />
            </label>
            <Honigtopf />
            <label className="public-consent light">
              <input type="checkbox" name="consent" required disabled={!offen} />
              <span>Ich stimme zu, dass meine Angaben zur Bearbeitung dieser Anfrage gespeichert und verarbeitet werden. *</span>
            </label>
            <button className="public-primary-button" type="submit" disabled={!offen}>Aufmaß anfragen</button>
          </Form>
        )}
      </div>
    </section>

    <section className="zm-cta">
      <div>
        <p className="public-eyebrow">Verkauf steht an</p>
        <h2>Aufmaß und Vermarktung aus einer Hand?</h2>
      </div>
      <div>
        <Link className="zm-primary" to="/bewertung">Bewertung anfragen</Link>
        <Link className="zm-secondary" to="/kontakt">Einfach anrufen</Link>
      </div>
    </section>

    <PublicFooter />
  </main>;
}
