import { data, Form, Link, redirect, useActionData, useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/email-vorlagen";
import { requireActiveUser } from "~/lib/auth.server";
import { PLATZHALTER, VORLAGENANLASS } from "~/lib/email-vorlage";
import { tagKurz } from "~/lib/format";
import { beschrifte } from "~/lib/labels";
import "~/programm-liste.css";
import "~/email-vorlagen.css";

import { ListenUeberschrift } from "~/components/listen-ueberschrift";
// Verwaltung > E-Mail-Vorlagen (P2-3, 16.10.2026).
//
// Das Buero pflegt hier die Texte fuer wiederkehrende E-Mails. Beim Schreiben
// einer E-Mail aus einer Akte fuellt eine Vorlage Betreff und Text vor;
// Platzhalter wie {{anrede}} werden aus der Akte gesetzt.
//
// Das CRM liefert keine Texte und prueft sie nicht -- insbesondere keine zu
// Provision, Widerruf oder anderen Rechtsfolgen. Vorlagen werden nicht
// geloescht, sondern abgeschaltet: eine E-Mail, die mit ihr geschrieben wurde,
// verweist im Verlauf weiter auf sie.

type Vorlage = { id: string; purpose: string; name: string; subject: string; body: string; active: boolean; sort_order: number; updated_at: string; version: number };
type Ergebnis = { error?: string };

function text(fd: FormData, k: string) { return String(fd.get(k) ?? "").trim(); }

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const [{ data: vorlagen, error }, { data: darf }] = await Promise.all([
    supabase.from("email_templates").select("id,purpose,name,subject,body,active,sort_order,updated_at,version").order("active", { ascending: false }).order("purpose").order("sort_order").order("name"),
    supabase.rpc("current_user_has_permission", { p_permission: "settings.manage" }),
  ]);
  if (error) throw new Response("E-Mail-Vorlagen konnten nicht geladen werden.", { status: 500, headers: responseHeaders() });
  return data({ vorlagen: (vorlagen ?? []) as Vorlage[], darfPflegen: darf === true }, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const { data: darf } = await supabase.rpc("current_user_has_permission", { p_permission: "settings.manage" });
  if (darf !== true) return data<Ergebnis>({ error: "Vorlagen pflegen darf nur, wer die Verwaltung pflegen darf." }, { status: 403, headers: responseHeaders() });
  const fd = await request.formData();
  const absicht = text(fd, "_intent");

  if (absicht === "speichern") {
    const felder = {
      purpose: text(fd, "purpose"),
      name: text(fd, "name"),
      subject: String(fd.get("subject") ?? "").trim(),
      body: String(fd.get("body") ?? "").replace(/\s+$/, ""),
      sort_order: Number(text(fd, "sort_order") || "100") || 100,
    };
    if (!felder.name) return data<Ergebnis>({ error: "Bitte einen Namen für die Vorlage angeben." }, { status: 400, headers: responseHeaders() });
    if (!(felder.purpose in VORLAGENANLASS)) return data<Ergebnis>({ error: "Bitte einen Anlass wählen." }, { status: 400, headers: responseHeaders() });
    const id = text(fd, "id");
    if (id) {
      const { data: geaendert, error } = await supabase.from("email_templates").update(felder).eq("id", id).eq("version", Number(text(fd, "version"))).select("id").maybeSingle();
      if (error) return data<Ergebnis>({ error: "Die Vorlage konnte nicht gespeichert werden." }, { status: 400, headers: responseHeaders() });
      if (!geaendert) return data<Ergebnis>({ error: "Die Vorlage wurde inzwischen von jemand anderem geändert. Bitte neu laden." }, { status: 409, headers: responseHeaders() });
      return redirect(`/crm/email-vorlagen?gespeichert=${id}#vorlage-${id}`, { headers: responseHeaders() });
    }
    const { data: neu, error } = await supabase.from("email_templates").insert(felder).select("id").single();
    if (error || !neu) return data<Ergebnis>({ error: "Die Vorlage konnte nicht angelegt werden." }, { status: 400, headers: responseHeaders() });
    return redirect(`/crm/email-vorlagen?gespeichert=${neu.id}#vorlage-${neu.id}`, { headers: responseHeaders() });
  }

  if (absicht === "aktiv") {
    const id = text(fd, "id");
    const { data: geaendert, error } = await supabase.from("email_templates").update({ active: text(fd, "active") === "1" }).eq("id", id).eq("version", Number(text(fd, "version"))).select("id").maybeSingle();
    if (error || !geaendert) return data<Ergebnis>({ error: "Die Vorlage konnte nicht umgeschaltet werden. Bitte neu laden." }, { status: 409, headers: responseHeaders() });
    return redirect(`/crm/email-vorlagen#vorlage-${id}`, { headers: responseHeaders() });
  }

  return data<Ergebnis>({ error: "Unbekannte Aktion." }, { status: 400, headers: responseHeaders() });
}

function Formular({ vorlage, abbrechen }: { vorlage: Vorlage | null; abbrechen?: string }) {
  return (
    <Form method="post" className="email-vorlage-formular">
      <input type="hidden" name="_intent" value="speichern" />
      {vorlage ? <><input type="hidden" name="id" value={vorlage.id} /><input type="hidden" name="version" value={vorlage.version} /></> : null}
      <div className="email-vorlage-reihe">
        <label className="form-field"><span>Name *</span><input name="name" required maxLength={120} defaultValue={vorlage?.name ?? ""} placeholder="z. B. Exposé an Interessenten" /></label>
        <label className="form-field"><span>Anlass *</span><select name="purpose" defaultValue={vorlage?.purpose ?? "INQUIRY_REPLY"}>{Object.entries(VORLAGENANLASS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="form-field email-vorlage-reihenfolge"><span>Reihenfolge</span><input name="sort_order" type="number" min={0} max={9999} defaultValue={vorlage?.sort_order ?? 100} /></label>
      </div>
      <label className="form-field"><span>Betreff</span><input name="subject" maxLength={300} defaultValue={vorlage?.subject ?? ""} placeholder="z. B. Ihr Exposé zu {{objekt_titel}}" /></label>
      <label className="form-field"><span>Text</span><textarea name="body" rows={12} maxLength={20000} defaultValue={vorlage?.body ?? ""} /></label>
      <div className="inline-actions">
        <button className="primary-button" type="submit">{vorlage ? "Speichern" : "Vorlage anlegen"}</button>
        {abbrechen ? <Link className="secondary-button link-button" to={abbrechen}>Abbrechen</Link> : null}
      </div>
    </Form>
  );
}

export default function EmailVorlagen() {
  const { vorlagen, darfPflegen } = useLoaderData<typeof loader>();
  const ergebnis = useActionData<typeof action>();
  const [suche] = useSearchParams();
  const bearbeiten = suche.get("bearbeiten");
  const gespeichert = suche.get("gespeichert");
  const neu = suche.get("neu") === "1";

  return (
    <main className="editor-shell programm-liste email-vorlagen"><ListenUeberschrift/>
      <div className="programm-liste-werkzeuge">
        <span className="programm-liste-zaehler">{vorlagen.length} {vorlagen.length === 1 ? "Vorlage" : "Vorlagen"}</span>
        {darfPflegen && !neu ? <Link className="programm-liste-neu" to="/crm/email-vorlagen?neu=1#neue-vorlage">+ Vorlage</Link> : null}
      </div>

      <p className="form-warning email-vorlagen-hinweis">
        Das CRM liefert keine Texte und prüft sie nicht. Aussagen zu Provision, Widerruf oder anderen Rechtsfolgen gehören nur nach eigener bzw. anwaltlicher Freigabe in eine Vorlage. Das CRM verschickt nichts: Eine Vorlage füllt Betreff und Text vor, das Mailprogramm öffnen Sie selbst.
      </p>
      {ergebnis?.error ? <p className="form-error">{ergebnis.error}</p> : null}

      {neu && darfPflegen ? (
        <section className="data-card" id="neue-vorlage" aria-label="Neue Vorlage">
          <div className="card-head"><div><h2>Neue Vorlage</h2></div></div>
          <Formular vorlage={null} abbrechen="/crm/email-vorlagen" />
        </section>
      ) : null}

      <div className="programm-tabelle-rahmen">
        {vorlagen.length === 0 ? (
          <p className="programm-liste-leer">Noch keine Vorlage. {darfPflegen ? <Link to="/crm/email-vorlagen?neu=1#neue-vorlage">Erste Vorlage anlegen</Link> : "Vorlagen legt an, wer die Verwaltung pflegen darf."}</p>
        ) : (
          <table className="programm-tabelle">
            <thead><tr><th>Name</th><th>Anlass</th><th>Betreff</th><th>Stand</th><th className="rechts">Geändert</th>{darfPflegen ? <th><span className="sr-only">Aktionen</span></th> : null}</tr></thead>
            <tbody>
              {vorlagen.map((v) => (
                <tr key={v.id} id={`vorlage-${v.id}`} className={gespeichert === v.id ? "email-vorlage-gespeichert" : undefined}>
                  <td>{darfPflegen ? <Link to={`/crm/email-vorlagen?bearbeiten=${v.id}#bearbeiten`}>{v.name}</Link> : <strong>{v.name}</strong>}</td>
                  <td>{beschrifte(VORLAGENANLASS, v.purpose)}</td>
                  <td className="leise">{v.subject || "—"}</td>
                  <td>{v.active ? "Aktiv" : "Abgeschaltet"}</td>
                  <td className="zahl rechts leise">{tagKurz(v.updated_at)}</td>
                  {darfPflegen ? (
                    <td className="rechts">
                      <Form method="post">
                        <input type="hidden" name="_intent" value="aktiv" />
                        <input type="hidden" name="id" value={v.id} />
                        <input type="hidden" name="version" value={v.version} />
                        <input type="hidden" name="active" value={v.active ? "0" : "1"} />
                        <button className="secondary-button compact" type="submit">{v.active ? "Abschalten" : "Einschalten"}</button>
                      </Form>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {bearbeiten && darfPflegen ? (() => {
        const v = vorlagen.find((x) => x.id === bearbeiten);
        return v ? (
          <section className="data-card" id="bearbeiten" aria-label={`Vorlage ${v.name} bearbeiten`}>
            <div className="card-head"><div><h2>{v.name}</h2></div></div>
            <Formular vorlage={v} abbrechen="/crm/email-vorlagen" />
          </section>
        ) : null;
      })() : null}

      <section className="data-card" aria-label="Platzhalter">
        <div className="card-head"><div><h2>Platzhalter</h2></div></div>
        <p className="form-help">In Betreff und Text werden diese Platzhalter aus der Akte eingesetzt. Fehlt ein Wert, bleibt der Platzhalter stehen und die Seite weist darauf hin.</p>
        <dl className="email-vorlage-platzhalter">
          {PLATZHALTER.map((p) => <div key={p.schluessel}><dt><code>{`{{${p.schluessel}}}`}</code></dt><dd>{p.bedeutung}</dd></div>)}
        </dl>
      </section>
    </main>
  );
}
