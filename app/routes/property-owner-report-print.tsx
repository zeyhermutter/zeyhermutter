import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/property-owner-report-print";
import { requirePermission } from "~/lib/auth.server";
import { euroRund, tag, zeitpunkt } from "~/lib/format";
import { IMMOBILIENSTATUS, KAUFANGEBOTSTATUS, beschrifte } from "~/lib/labels";
import { IMMOBILIENARTEN } from "~/lib/public-intake";
import { ABSAGEGRUND, INTERESSE, PREISEINSCHAETZUNG, beschriftung } from "~/lib/besichtigung-feedback";
import type { BerichtInhalt } from "~/lib/eigentuemerbericht.server";
import "~/eigentuemerbericht.css";

// Druckansicht eines festgehaltenen Eigentuemerberichts (27.10.2026). Zeigt
// nur den gespeicherten Stand (owner_reports.content). "Drucken / als PDF
// speichern" nutzt den Druckdialog des Browsers; die Leisten des Programms
// sind im Druck ausgeblendet.

const ART = new Map(IMMOBILIENARTEN);
const PORTAL: Record<string, string> = { PLANNED: "geplant", READY: "bereit", LIVE: "online", PAUSED: "pausiert", ERROR: "Fehler", ENDED: "beendet" };

export function meta() {
  return [{ title: "Eigentümerbericht" }, { name: "robots", content: "noindex,nofollow" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "property.read");
  const { data: bericht } = await supabase.from("owner_reports").select("id,report_number,property_id,period_from,period_to,content,created_at,sent_at")
    .eq("id", params.reportId ?? "").eq("property_id", params.propertyId ?? "").maybeSingle();
  if (!bericht) throw new Response("Bericht nicht gefunden.", { status: 404 });
  return data({ bericht: bericht as any }, { headers: responseHeaders() });
}

function Verteilung({ titel, werte, liste }: { titel: string; werte: Record<string, number>; liste: [string, string][] }) {
  const eintraege = liste.filter(([k]) => werte[k]);
  if (!eintraege.length) return null;
  return <div className="eb-verteilung"><h4>{titel}</h4><ul>{eintraege.map(([k]) => <li key={k}><span>{beschriftung(liste, k)}</span><strong>{werte[k]}</strong></li>)}</ul></div>;
}

export default function OwnerReportPrint() {
  const { bericht } = useLoaderData<typeof loader>();
  const c = bericht.content as BerichtInhalt;
  const z = c.kennzahlen;
  const zeilen: [string, number, number][] = [
    ["Anfragen", z.zeitraum.anfragen, z.gesamt.anfragen],
    ["Exposés verschickt", z.zeitraum.exposes, z.gesamt.exposes],
    ["Exposé-Öffnungen", z.zeitraum.exposeOeffnungen, z.gesamt.exposeOeffnungen],
    ["Besichtigungen durchgeführt", z.zeitraum.besichtigungen, z.gesamt.besichtigungen],
    ["Angebote", z.zeitraum.angebote, z.gesamt.angebote],
  ];
  return (
    <div className="eb-seite">
      <div className="eb-werkzeug">
        <Link className="secondary-button link-button compact" to={`/properties/${bericht.property_id}/eigentuemerbericht`}>← Zurück zum Bericht</Link>
        <button className="primary-button" type="button" onClick={() => window.print()}>Drucken / als PDF speichern</button>
      </div>
      <article className="eb-blatt">
        <header className="eb-kopf">
          <div>
            <p className="eb-firma">{c.firma.name ?? ""}</p>
            <h1>Bericht zur Vermarktung</h1>
            <p>{c.objekt.titel} · {c.objekt.nummer}{c.objekt.adresse ? <><br />{c.objekt.adresse}</> : null}</p>
          </div>
          <div className="eb-meta">
            <p><strong>{bericht.report_number}</strong></p>
            <p>Zeitraum {tag(c.zeitraum.von)} – {tag(c.zeitraum.bis)}</p>
            <p>Stand {zeitpunkt(c.erstellt)}</p>
            {c.eigentuemer.length ? <p>für {c.eigentuemer.join(", ")}</p> : null}
          </div>
        </header>

        <section>
          <h2>Stand der Vermarktung</h2>
          <dl className="eb-felder">
            <div><dt>Status</dt><dd>{beschrifte(IMMOBILIENSTATUS, c.objekt.status)}</dd></div>
            {c.objekt.art ? <div><dt>Objektart</dt><dd>{ART.get(c.objekt.art) ?? c.objekt.art}</dd></div> : null}
            {c.objekt.preis != null ? <div><dt>{c.objekt.vermarktung === "RENT" ? "Kaltmiete" : "Angebotspreis"}</dt><dd>{euroRund(c.objekt.preis)}</dd></div> : null}
            {c.portale.length ? <div><dt>Veröffentlicht</dt><dd>{c.portale.map((p) => `${p.name} (${PORTAL[p.status] ?? p.status}${p.seit ? ` seit ${tag(p.seit)}` : ""})`).join(", ")}</dd></div> : null}
          </dl>
        </section>

        <section>
          <h2>Zahlen</h2>
          <table className="eb-tabelle">
            <thead><tr><th></th><th>im Zeitraum</th><th>seit Beginn</th></tr></thead>
            <tbody>{zeilen.map(([n, a, b]) => <tr key={n}><td>{n}</td><td>{a}</td><td>{b}</td></tr>)}</tbody>
          </table>
          {z.gesamt.geplant ? <p>Geplante Besichtigungen: {z.gesamt.geplant}</p> : null}
        </section>

        {c.stimmung.anzahl ? (
          <section>
            <h2>Rückmeldungen nach Besichtigungen</h2>
            <p>{c.stimmung.anzahl} {c.stimmung.anzahl === 1 ? "Rückmeldung" : "Rückmeldungen"} im Zeitraum.</p>
            <div className="eb-spalten">
              <Verteilung titel="Interesse" werte={c.stimmung.interesse} liste={INTERESSE} />
              <Verteilung titel="Preiseinschätzung" werte={c.stimmung.preis} liste={PREISEINSCHAETZUNG} />
              <Verteilung titel="Hauptgrund bei Absage" werte={c.stimmung.gruende} liste={ABSAGEGRUND} />
            </div>
            {c.zitate.length ? (
              <div className="eb-zitate">
                {c.zitate.map((q) => <blockquote key={q.schluessel}><p>„{q.text}“</p><cite>{q.wer} · {q.art === "gefallen" ? "gefallen" : q.art === "bedenken" ? "Bedenken" : "Anmerkung"}</cite></blockquote>)}
              </div>
            ) : null}
          </section>
        ) : null}

        {c.angebote && c.angebote.length ? (
          <section>
            <h2>Angebote</h2>
            <table className="eb-tabelle">
              <thead><tr><th>Von</th><th>Betrag</th><th>Stand</th><th>Datum</th></tr></thead>
              <tbody>{c.angebote.map((o, i) => <tr key={i}><td>{o.wer}</td><td>{euroRund(o.betrag)}</td><td>{beschrifte(KAUFANGEBOTSTATUS, o.status)}</td><td>{tag(o.datum)}</td></tr>)}</tbody>
            </table>
          </section>
        ) : null}

        {c.taetigkeiten ? <section><h2>Unsere Tätigkeiten</h2><p className="eb-text">{c.taetigkeiten}</p></section> : null}
        {c.einschaetzung ? <section><h2>Einschätzung und nächste Schritte</h2><p className="eb-text">{c.einschaetzung}</p></section> : null}

        <footer className="eb-fuss">
          <p>Interessenten sind ohne Namen genannt.</p>
          {c.firma.zeile ? <p>{c.firma.zeile}</p> : null}
          {c.firma.telefon || c.firma.email ? <p>{[c.firma.telefon, c.firma.email].filter(Boolean).join(" · ")}</p> : null}
        </footer>
      </article>
    </div>
  );
}
