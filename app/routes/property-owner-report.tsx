import { data, Form, Link, redirect, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/property-owner-report";
import { requirePermission } from "~/lib/auth.server";
import { tag, zeitpunkt } from "~/lib/format";
import { berichtsdaten, inhaltFesthalten, standardZeitraum, taetigkeitenVorschlag, zitatKandidaten } from "~/lib/eigentuemerbericht.server";
import { KAUFANGEBOTSTATUS, beschrifte } from "~/lib/labels";

// Eigentuemerbericht (27.10.2026). Zeitraum waehlen, Zitate anhaken, Text
// ergaenzen, festhalten -- dann oeffnet die Druckansicht, und "Drucken / als
// PDF speichern" erzeugt die Datei, die der Makler selbst verschickt. Die
// Interessenten heissen im Bericht "Interessent 1, 2 ..."; Namen stehen
// nirgends drin.

type ActionResult = { error?: string; ok?: string };
const DATUM_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function zeitraumAus(url: URL, letzterBis: string | null) {
  const s = standardZeitraum(letzterBis);
  const von = url.searchParams.get("von") ?? "";
  const bis = url.searchParams.get("bis") ?? "";
  const v = DATUM_RE.test(von) ? von : s.von;
  const b = DATUM_RE.test(bis) ? bis : s.bis;
  return v <= b ? { von: v, bis: b } : { von: b, bis: v };
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, "property.read");
  const id = params.propertyId ?? "";
  const { data: letzter } = await supabase.from("owner_reports").select("period_to").eq("property_id", id).order("period_to", { ascending: false }).limit(1).maybeSingle();
  const { von, bis } = zeitraumAus(new URL(request.url), (letzter as any)?.period_to ?? null);
  const [d, { data: darf }] = await Promise.all([
    berichtsdaten(supabase, id, von, bis),
    supabase.rpc("current_user_has_permission", { p_permission: "property.write" }),
  ]);
  if (!d.objekt) throw new Response("Immobilie nicht gefunden.", { status: 404 });
  const vorschau = inhaltFesthalten(d, { zitate: new Set(), angeboteZeigen: true, taetigkeiten: "", einschaetzung: "" });
  return data({
    objekt: { id: d.objekt.id, nummer: d.objekt.property_number, titel: d.objekt.internal_title },
    von, bis,
    kennzahlen: vorschau.kennzahlen,
    stimmung: vorschau.stimmung,
    angebote: vorschau.angebote ?? [],
    zitate: zitatKandidaten(d),
    taetigkeiten: taetigkeitenVorschlag(vorschau.kennzahlen.zeitraum),
    eigentuemer: vorschau.eigentuemer,
    frueher: d.frueher,
    darfSchreiben: darf === true,
  }, { headers: responseHeaders() });
}

export async function action({ request, context, params }: Route.ActionArgs) {
  const { supabase, responseHeaders, userId } = await requirePermission(request, context.cloudflare.env, "property.write");
  const id = params.propertyId ?? "";
  const fd = await request.formData();
  const intent = String(fd.get("_intent") ?? "");

  if (intent === "versendet") {
    const berichtId = String(fd.get("report_id") ?? "");
    if (!UUID_RE.test(berichtId)) return data<ActionResult>({ error: "Unbekannter Bericht." }, { status: 400, headers: responseHeaders() });
    const { data: bericht, error } = await supabase.from("owner_reports").update({ sent_at: new Date().toISOString(), sent_by: userId })
      .eq("id", berichtId).eq("property_id", id).is("sent_at", null).select("id,report_number,period_from,period_to").maybeSingle();
    if (error || !bericht) return data<ActionResult>({ error: "Der Versand konnte nicht vermerkt werden." }, { status: 400, headers: responseHeaders() });
    const { data: besitzer } = await supabase.from("property_owners").select("contact_id").eq("property_id", id);
    const empfaenger = [...new Set(((besitzer ?? []) as any[]).map((b) => b.contact_id))];
    const eintrag = (contact_id: string | null) => ({
      activity_type: "OWNER_REPORT_SENT", title: `Eigentümerbericht ${bericht.report_number} versendet`,
      description: `Zeitraum ${tag(bericht.period_from)} bis ${tag(bericht.period_to)}`,
      actor_user_id: userId, property_id: id, contact_id, metadata: { owner_report_id: bericht.id },
    });
    await supabase.from("activity_events").insert(empfaenger.length ? empfaenger.map(eintrag) : [eintrag(null)]);
    return data<ActionResult>({ ok: `${bericht.report_number} als versendet vermerkt.` }, { headers: responseHeaders() });
  }

  const von = String(fd.get("von") ?? ""), bis = String(fd.get("bis") ?? "");
  if (!DATUM_RE.test(von) || !DATUM_RE.test(bis) || von > bis) return data<ActionResult>({ error: "Bitte einen gültigen Zeitraum wählen." }, { status: 400, headers: responseHeaders() });
  const d = await berichtsdaten(supabase, id, von, bis);
  if (!d.objekt) return data<ActionResult>({ error: "Immobilie nicht gefunden." }, { status: 404, headers: responseHeaders() });
  const inhalt = inhaltFesthalten(d, {
    zitate: new Set(fd.getAll("zitat").map(String)),
    angeboteZeigen: fd.get("angebote") === "ja",
    taetigkeiten: String(fd.get("taetigkeiten") ?? "").trim(),
    einschaetzung: String(fd.get("einschaetzung") ?? "").trim(),
  });
  const { data: neu, error } = await supabase.from("owner_reports")
    .insert({ property_id: id, period_from: von, period_to: bis, content: inhalt, created_by: userId }).select("id").single();
  if (error || !neu) return data<ActionResult>({ error: "Der Bericht konnte nicht festgehalten werden." }, { status: 400, headers: responseHeaders() });
  return redirect(`/properties/${id}/eigentuemerbericht/${neu.id}`, { headers: responseHeaders() });
}

const ART: Record<string, string> = { gefallen: "Gefallen", bedenken: "Bedenken", anmerkung: "Anmerkung" };

export default function PropertyOwnerReport() {
  const d = useLoaderData<typeof loader>();
  const ergebnis = useActionData<typeof action>();
  const z = d.kennzahlen;
  const zeilen: [string, number, number][] = [
    ["Anfragen", z.zeitraum.anfragen, z.gesamt.anfragen],
    ["Exposés verschickt", z.zeitraum.exposes, z.gesamt.exposes],
    ["Exposé-Öffnungen", z.zeitraum.exposeOeffnungen, z.gesamt.exposeOeffnungen],
    ["Besichtigungen durchgeführt", z.zeitraum.besichtigungen, z.gesamt.besichtigungen],
    ["Angebote", z.zeitraum.angebote, z.gesamt.angebote],
  ];
  return (
    <div className="editor-shell">
      <div className="editor-header">
        <div>
          <p className="eyebrow">{d.objekt.nummer}</p>
          <h1>Eigentümerbericht</h1>
          <p className="subtle">{d.objekt.titel}{d.eigentuemer.length ? ` · für ${d.eigentuemer.join(", ")}` : " · kein Eigentümer erfasst"}</p>
        </div>
      </div>
      {ergebnis?.error ? <p className="form-error">{ergebnis.error}</p> : null}
      {ergebnis?.ok ? <p className="success-banner">{ergebnis.ok}</p> : null}

      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Schritt 1</p><h2>Zeitraum</h2></div></div>
        <Form method="get" className="inline-actions">
          <label className="form-field"><span>Von</span><input type="date" name="von" defaultValue={d.von} /></label>
          <label className="form-field"><span>Bis</span><input type="date" name="bis" defaultValue={d.bis} /></label>
          <button className="secondary-button compact" type="submit">Zeitraum übernehmen</button>
        </Form>
        <p className="subtle">Vorgeschlagen: ab dem Tag nach dem letzten Bericht, sonst die letzten 14 Tage.</p>
      </section>

      <Form method="post">
        <input type="hidden" name="von" value={d.von} />
        <input type="hidden" name="bis" value={d.bis} />
        <section className="data-card">
          <div className="card-head"><div><p className="eyebrow">Schritt 2</p><h2>Was im Bericht steht</h2></div></div>
          <table className="programm-tabelle">
            <thead><tr><th>Kennzahl</th><th className="rechts">{tag(d.von)} – {tag(d.bis)}</th><th className="rechts">seit Beginn</th></tr></thead>
            <tbody>{zeilen.map(([name, a, b]) => <tr key={name}><td>{name}</td><td className="rechts">{a}</td><td className="rechts">{b}</td></tr>)}</tbody>
          </table>
          <p className="subtle">Dazu: Portale, Stimmung aus {d.stimmung.anzahl} {d.stimmung.anzahl === 1 ? "Rückmeldung" : "Rückmeldungen"} (Interesse, Preiseinschätzung, Absagegründe) und {z.gesamt.geplant} geplante Besichtigungen. Interessenten erscheinen nur als „Interessent 1, 2 …“.</p>

          <fieldset className="feedback-zitate">
            <legend>Rückmeldungen wörtlich zeigen (nur angehakte)</legend>
            {d.zitate.length ? d.zitate.map((q) => (
              <label key={q.schluessel} className="checkbox-row">
                <input type="checkbox" name="zitat" value={q.schluessel} />
                <span><strong>{q.wer} · {ART[q.art]}</strong> <small className="row-meta">{tag(q.datum)}</small><br />{q.text}</span>
              </label>
            )) : <p className="empty-state">Keine Rückmeldungen mit Text in diesem Zeitraum.</p>}
          </fieldset>

          {d.angebote.length ? (
            <label className="checkbox-row">
              <input type="checkbox" name="angebote" value="ja" />
              <span>Angebote mit Betrag zeigen: {d.angebote.map((o) => `${o.wer} ${Math.round(o.betrag).toLocaleString("de-DE")} € (${beschrifte(KAUFANGEBOTSTATUS, o.status)})`).join(" · ")}</span>
            </label>
          ) : null}

          <label className="form-field"><span>Unsere Tätigkeiten</span><textarea name="taetigkeiten" rows={5} defaultValue={d.taetigkeiten} /></label>
          <label className="form-field"><span>Einschätzung und nächste Schritte</span><textarea name="einschaetzung" rows={5} placeholder="z. B. Stimmung zum Preis, geplante Maßnahmen, Termine" /></label>
        </section>
        {d.darfSchreiben ? (
          <div className="inline-actions">
            <button className="primary-button" type="submit" name="_intent" value="festhalten">Bericht festhalten und Druckansicht öffnen</button>
            <span className="subtle">Danach „Drucken / als PDF speichern“ – verschickt wird er von Ihnen.</span>
          </div>
        ) : <p className="empty-state">Zum Festhalten fehlt die Berechtigung „Immobilien bearbeiten“.</p>}
      </Form>

      <section className="data-card">
        <div className="card-head"><div><p className="eyebrow">Verlauf</p><h2>Bisherige Berichte</h2></div></div>
        {d.frueher.length ? (
          <div className="data-list">
            {(d.frueher as any[]).map((b) => (
              <div className="data-row" key={b.id}>
                <div style={{ flex: 1 }}>
                  <strong>{b.report_number}</strong>
                  <small className="row-meta">{tag(b.period_from)} – {tag(b.period_to)} · erstellt {zeitpunkt(b.created_at)} · {b.sent_at ? `versendet ${zeitpunkt(b.sent_at)}` : "noch nicht versendet"}</small>
                </div>
                <div className="inline-actions">
                  <Link className="secondary-button link-button compact" to={`/properties/${d.objekt.id}/eigentuemerbericht/${b.id}`}>Druckansicht</Link>
                  {!b.sent_at && d.darfSchreiben ? (
                    <Form method="post"><input type="hidden" name="_intent" value="versendet" /><input type="hidden" name="report_id" value={b.id} /><button className="secondary-button compact" type="submit">Als versendet vermerken</button></Form>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        ) : <p className="empty-state">Noch kein Bericht für diese Immobilie.</p>}
      </section>
    </div>
  );
}
