import { data, Form, Link, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/public-search-request";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { Honigtopf, PublicFooter, PublicHeader } from "~/components/public-shell";
import { ART_DER_SUCHE, HONIGTOPF_FELD, IMMOBILIENARTEN, IMMOBILIENARTEN_SCHLUESSEL } from "~/lib/public-intake";
import {
  aufnahmewegOffen, einsendeSchluessel, epostGueltig, sendeAufnahme, textFeld, zahlFeld,
} from "~/lib/public-intake.server";
import "~/public-website.css";

// Der Suchauftrag legt im CRM ein echtes Suchprofil an -- dieselbe Tabelle,
// mit der intern gearbeitet wird, nicht eine Nebenablage fuer
// Website-Eintraege. Deshalb muss das Formular abfragen, was ein Suchprofil
// mindestens braucht: Kauf oder Miete, mindestens eine Immobilienart und
// mindestens eine Ortsangabe. Ohne Ort laesst sich ein Suchprofil in der
// Datenbank gar nicht anlegen.
//
// Alles andere ist freiwillig. Wer noch keine Preisvorstellung hat, soll
// trotzdem absenden koennen.

type ActionResult = { ok?: string; error?: string };

export function meta({ data: routeData }: Route.MetaArgs) {
  const canonicalUrl = (routeData as { canonicalUrl?: string } | undefined)?.canonicalUrl;
  return [
    { title: "Suchauftrag · ZeyherMutter" },
    { name: "description", content: "Sagen Sie uns, was Sie suchen — wir melden uns, bevor ein passendes Objekt im Portal steht." },
    { name: "robots", content: "index,follow" },
    ...(canonicalUrl ? [{ tagName: "link" as const, rel: "canonical", href: canonicalUrl }] : []),
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const url = new URL(request.url);
  const { supabase } = createSupabaseServerClient(request, context.cloudflare.env);
  const offen = await aufnahmewegOffen(supabase, "SEARCH_PROFILE");
  return data({ canonicalUrl: new URL("/suchauftrag", url.origin).toString(), offen },
    { headers: { "Cache-Control": "public, max-age=60, s-maxage=120" } });
}

export async function action({ request, context }: Route.ActionArgs) {
  const fd = await request.formData();
  if (textFeld(fd, HONIGTOPF_FELD, 120)) return data<ActionResult>({ ok: "Vielen Dank. Ihr Suchauftrag wurde entgegengenommen." });

  const vorname = textFeld(fd, "first_name", 100);
  const nachname = textFeld(fd, "last_name", 100);
  const epost = textFeld(fd, "email", 254).toLowerCase();
  const telefon = textFeld(fd, "phone", 60);
  const artDerSuche = textFeld(fd, "transaction_type", 10);
  const arten = [...new Set(fd.getAll("property_types").map(String).filter((wert) => IMMOBILIENARTEN_SCHLUESSEL.has(wert)))];
  const plz = textFeld(fd, "postal_code", 5);
  const ort = textFeld(fd, "city", 120);
  const nachricht = textFeld(fd, "message", 4000);
  const einwilligung = fd.get("consent") === "on";

  const plzGueltig = /^\d{5}$/.test(plz);
  if (!vorname || !nachname || !epostGueltig(epost)
      || !ART_DER_SUCHE.some(([key]) => key === artDerSuche)
      || arten.length === 0
      || (!plzGueltig && ort.length < 2)
      || !einwilligung) {
    return data<ActionResult>({
      error: "Bitte geben Sie Ihren Namen, eine E-Mail-Adresse, mindestens eine Immobilienart und eine Postleitzahl oder einen Ort an — und bestätigen Sie die Einwilligung.",
    }, { status: 400 });
  }

  const ergebnis = await sendeAufnahme(context.cloudflare.env, {
    kind: "SEARCH_PROFILE",
    first_name: vorname, last_name: nachname, email: epost, phone: telefon,
    transaction_type: artDerSuche, property_types: arten,
    max_price: zahlFeld(fd, "max_price"),
    min_rooms: zahlFeld(fd, "min_rooms"),
    min_living_area: zahlFeld(fd, "min_living_area"),
    postal_code: plzGueltig ? plz : "", city: ort,
    message: nachricht, consent: true, company: "",
    submission_key: einsendeSchluessel("suchauftrag"),
    source_url: new URL(request.url).pathname,
  });
  if (!ergebnis.ok) return data<ActionResult>({ error: ergebnis.meldung }, { status: ergebnis.status });
  return data<ActionResult>({ ok: "Ihr Suchauftrag ist angelegt. Wir melden uns, sobald etwas Passendes dabei ist." });
}

export default function PublicSearchRequest() {
  const { offen } = useLoaderData<typeof loader>();
  const ergebnis = useActionData<typeof action>();
  return <main className="public-site">
    <PublicHeader />

    <section className="public-hero">
      <p className="public-eyebrow">Suchauftrag</p>
      <h1>Wir melden uns, bevor es im Portal steht.</h1>
      <p>Nicht jede Immobilie geht sofort in die Portale. Wer bei uns hinterlegt ist, was er sucht, erfährt von passenden Objekten, sobald wir sie in die Vermarktung nehmen.</p>
    </section>

    <section className="public-contact-page" id="anfrage">
      <div>
        <p className="public-eyebrow">Was wir brauchen</p>
        <h2>Drei Angaben genügen</h2>
        <p>Kauf oder Miete, welche Art von Immobilie, und wo. Alles Weitere ist freiwillig — wenn Sie beim Budget noch unsicher sind, lassen Sie das Feld leer.</p>
        {offen ? null : (
          <div className="public-preview-safety">
            <strong>Das Formular ist derzeit geschlossen</strong>
            <span>Es nimmt gerade keine Suchaufträge entgegen. Schreiben Sie uns bitte über die Kontaktseite.</span>
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

            <label><span>Kaufen oder mieten? *</span>
              <select name="transaction_type" defaultValue="BUY" required disabled={!offen}>
                {ART_DER_SUCHE.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
              </select>
            </label>

            <fieldset className="sales-check-support">
              <legend>Welche Immobilienart? * <small>(Mehrfachauswahl möglich)</small></legend>
              {IMMOBILIENARTEN.map(([key, label]) => (
                <label key={key}><input type="checkbox" name="property_types" value={key} disabled={!offen} /> {label}</label>
              ))}
            </fieldset>

            <div className="public-form-grid">
              <label><span>PLZ</span><input name="postal_code" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} autoComplete="postal-code" disabled={!offen} /></label>
              <label><span>Ort</span><input name="city" autoComplete="address-level2" disabled={!offen} /></label>
            </div>
            <p className="zm-feldhinweis">Eines von beiden genügt, wir brauchen nur eine Gegend.</p>

            <div className="public-form-grid">
              <label><span>Budget bis <small>(optional, in Euro)</small></span><input name="max_price" inputMode="numeric" disabled={!offen} /></label>
              <label><span>Zimmer ab <small>(optional)</small></span><input name="min_rooms" inputMode="decimal" disabled={!offen} /></label>
            </div>
            <label><span>Wohnfläche ab <small>(optional, in m²)</small></span><input name="min_living_area" inputMode="numeric" disabled={!offen} /></label>

            <label><span>Nachricht <small>(optional)</small></span>
              <textarea name="message" rows={4} maxLength={4000} placeholder="Was ist Ihnen wichtig? Was kommt nicht infrage?" disabled={!offen} />
            </label>
            <Honigtopf />
            <label className="public-consent light">
              <input type="checkbox" name="consent" required disabled={!offen} />
              <span>Ich stimme zu, dass meine Angaben zur Bearbeitung dieses Suchauftrags gespeichert und verarbeitet werden. *</span>
            </label>
            <button className="public-primary-button" type="submit" disabled={!offen}>Suchauftrag anlegen</button>
          </Form>
        )}
      </div>
    </section>

    <section className="zm-cta">
      <div>
        <p className="public-eyebrow">Schon konkret</p>
        <h2>Sehen Sie sich an, was gerade da ist.</h2>
      </div>
      <div>
        <Link className="zm-primary" to="/immobilien">Aktuelle Objekte</Link>
        <Link className="zm-secondary" to="/kontakt">Kontakt</Link>
      </div>
    </section>

    <PublicFooter />
  </main>;
}
