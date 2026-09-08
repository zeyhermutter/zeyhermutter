import { data, Form, Link, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/public-valuation";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Honigtopf, PublicFooter, PublicHeader } from "~/components/public-shell";
import { HONIGTOPF_FELD, IMMOBILIENARTEN, IMMOBILIENARTEN_SCHLUESSEL, ZUSTAENDE, ZEITRAEUME } from "~/lib/public-intake";
import {
  aufnahmewegOffen, einsendeSchluessel, epostGueltig, sendeAufnahme, textFeld,
} from "~/lib/public-intake.server";
import "~/public-website.css";

// Die Bewertungsanfrage ist bei fast allen untersuchten Maklern der zentrale
// Einstieg fuer Eigentuemer. Sie ist hier ausdruecklich eine Terminanfrage und
// kein Rechner.
//
// Der Grund steht im Text der Seite und ist keine Ausrede: eine Zahl, die aus
// Postleitzahl und Quadratmetern entsteht, ist keine Bewertung. Sie kennt den
// Zustand nicht, die Lage im Haus nicht, die Unterlagen nicht. Wer sie
// trotzdem ausgibt, erzeugt eine Erwartung, die im Gespraech wieder
// eingesammelt werden muss -- und im Zweifel eine Wertaussage, fuer die
// jemand geradesteht.

type ActionResult = { ok?: string; error?: string };

export function meta({ data: routeData }: Route.MetaArgs) {
  const canonicalUrl = (routeData as { canonicalUrl?: string } | undefined)?.canonicalUrl;
  return [
    { title: "Immobilienbewertung anfragen · ZeyherMutter" },
    { name: "description", content: "Eine Einschätzung Ihrer Immobilie durch eine Person, die sie gesehen hat — nicht durch einen Rechner." },
    { name: "robots", content: "index,follow" },
    ...(canonicalUrl ? [{ tagName: "link" as const, rel: "canonical", href: canonicalUrl }] : []),
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { supabase } = createSupabaseServerClient(request, context.cloudflare.env);
  const offen = await aufnahmewegOffen(supabase, "VALUATION");
  return data({ canonicalUrl: new URL("/bewertung", url.origin).toString(), offen },
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
  const art = textFeld(fd, "property_type", 40);
  const zustand = textFeld(fd, "property_condition", 160);
  const zeitraum = textFeld(fd, "sale_timeframe", 160);
  const nachricht = textFeld(fd, "message", 4000);
  const einwilligung = fd.get("consent") === "on";

  if (!vorname || !nachname || !epostGueltig(epost) || !/^\d{5}$/.test(plz) || ort.length < 2
      || !IMMOBILIENARTEN_SCHLUESSEL.has(art) || !ZUSTAENDE.includes(zustand) || !ZEITRAEUME.includes(zeitraum)
      || !einwilligung) {
    return data<ActionResult>({ error: "Bitte füllen Sie alle Pflichtfelder aus und bestätigen Sie die Einwilligung." }, { status: 400 });
  }

  const ergebnis = await sendeAufnahme(context.cloudflare.env, {
    kind: "VALUATION",
    first_name: vorname, last_name: nachname, email: epost, phone: telefon,
    postal_code: plz, city: ort,
    property_type: art, property_condition: zustand, sale_timeframe: zeitraum,
    message: nachricht, consent: true, company: "",
    submission_key: einsendeSchluessel("bewertung"),
    source_url: new URL(request.url).pathname,
  });
  if (!ergebnis.ok) return data<ActionResult>({ error: ergebnis.meldung }, { status: ergebnis.status });
  return data<ActionResult>({ ok: "Vielen Dank. Wir melden uns, um einen Termin für die Besichtigung zu vereinbaren." });
}

export default function PublicValuation() {
  const { offen } = useLoaderData<typeof loader>();
  const ergebnis = useActionData<typeof action>();
  return <main className="public-site">
    <PublicHeader />

    <section className="public-hero">
      <p className="public-eyebrow">Immobilienbewertung</p>
      <h1>Was ist Ihre Immobilie wert?</h1>
      <p>Die ehrliche Antwort: das lässt sich nicht aus der Postleitzahl ableiten. Wir sehen uns die Immobilie an und sagen Ihnen danach, was wir für erzielbar halten — mit den Vergleichsobjekten, auf die wir uns dabei stützen.</p>
    </section>

    <section className="zm-warum">
      <div>
        <p className="public-eyebrow">Warum kein Rechner</p>
        <h2>Eine Zahl ohne Besichtigung ist eine Vermutung.</h2>
      </div>
      <div className="public-prose-large">
        <p>Online-Rechner kennen Fläche, Baujahr und Lage. Sie kennen nicht den Zustand der Fenster, den Grundriss, die Beschlusslage der Eigentümergemeinschaft, die offene Sonderumlage oder den Blick aus dem Wohnzimmer. Genau diese Punkte entscheiden über den Preis.</p>
        <p><strong>Was Sie stattdessen bekommen:</strong> einen Termin vor Ort, eine Einordnung anhand vergleichbarer Verkäufe und eine schriftliche Zusammenfassung, die die Annahmen benennt, auf denen sie beruht.</p>
      </div>
    </section>

    <section className="public-contact-page" id="anfrage">
      <div>
        <p className="public-eyebrow">Unverbindlich</p>
        <h2>Termin anfragen</h2>
        <p>Die Anfrage kostet nichts und verpflichtet zu nichts. Ihre Angaben werden ausschließlich zur Bearbeitung dieser Anfrage verarbeitet.</p>
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
            <div className="public-form-grid">
              <label><span>Immobilienart *</span>
                <select name="property_type" defaultValue="" required disabled={!offen}>
                  <option value="" disabled>Bitte auswählen</option>
                  {IMMOBILIENARTEN.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label><span>Grober Zustand *</span>
                <select name="property_condition" defaultValue="" required disabled={!offen}>
                  <option value="" disabled>Bitte auswählen</option>
                  {ZUSTAENDE.map((wert) => <option key={wert}>{wert}</option>)}
                </select>
              </label>
            </div>
            <label><span>Gewünschter Verkaufszeitraum *</span>
              <select name="sale_timeframe" defaultValue="" required disabled={!offen}>
                <option value="" disabled>Bitte auswählen</option>
                {ZEITRAEUME.map((wert) => <option key={wert}>{wert}</option>)}
              </select>
            </label>
            <label><span>Nachricht <small>(optional)</small></span>
              <textarea name="message" rows={4} maxLength={4000} placeholder="Was sollten wir vorab über die Immobilie wissen?" disabled={!offen} />
            </label>
            <Honigtopf />
            <label className="public-consent light">
              <input type="checkbox" name="consent" required disabled={!offen} />
              <span>Ich stimme zu, dass meine Angaben zur Bearbeitung dieser Anfrage gespeichert und verarbeitet werden. *</span>
            </label>
            <button className="public-primary-button" type="submit" disabled={!offen}>Termin anfragen</button>
          </Form>
        )}
      </div>
    </section>

    <section className="zm-cta">
      <div>
        <p className="public-eyebrow">Noch unentschieden</p>
        <h2>Erst prüfen, ob sich Vorbereitung lohnt?</h2>
      </div>
      <div>
        <Link className="zm-primary" to="/verkaufsfertig-check">Zum Verkaufsstrategie-Check</Link>
        <Link className="zm-secondary" to="/kontakt">Einfach anrufen</Link>
      </div>
    </section>

    <PublicFooter />
  </main>;
}
