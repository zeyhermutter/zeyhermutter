import { data, Form, Link, redirect, useActionData, useLoaderData, useSearchParams } from "react-router";
import type { Route } from "./+types/firma";
import { requireActiveUser } from "~/lib/auth.server";
import { FIRMA_SPALTEN, fehlendeAngaben, pflichtangaben, type Firma } from "~/lib/firma";
import { tag } from "~/lib/format";
import { ListenUeberschrift } from "~/components/listen-ueberschrift";
import "~/programm-liste.css";
import "~/firma.css";

// Verwaltung › Firma & Fristen (19.10.2026, Freigabe Sebastian nach seinem
// Unternehmens-Dokument).
//
// Oben die Firmenangaben an einer Stelle: sie stehen in der Fusszeile neuer
// Exposés und im E-Mail-Platzhalter {{firma_pflichtangaben}}. Darunter die
// wiederkehrenden Fristen des Unternehmens; die taegliche Automatik legt vor
// jeder Faelligkeit eine Aufgabe an.
//
// Das CRM prueft weder die Angaben noch die Termine rechtlich oder
// steuerlich. Es zeigt, was fehlt, und erinnert an das, was eingetragen ist.

type Frist = { id: string; title: string; note: string | null; first_due_on: string; repeat: string; lead_days: number; responsible_user: string | null; active: boolean; version: number };
type Ergebnis = { error?: string };

const RHYTHMUS: Record<string, string> = { ONCE: "einmalig", MONTHLY: "monatlich", QUARTERLY: "vierteljährlich", YEARLY: "jährlich" };
const MONATE: Record<string, number> = { MONTHLY: 1, QUARTERLY: 3, YEARLY: 12 };

function text(fd: FormData, k: string) { return String(fd.get(k) ?? "").trim(); }
function oderNull(v: string) { return v ? v : null; }

/** Wie app_private.automatik_firmen_fristen: vom ersten Termin aus gezaehlt. */
function naechsteFaelligkeit(erster: string, rhythmus: string, heute = new Date().toISOString().slice(0, 10)): string | null {
  const m = MONATE[rhythmus];
  if (!m) return erster >= heute ? erster : null;
  const [j, mo, t] = erster.split("-").map(Number);
  for (let k = 0; k <= 1200; k++) {
    const ziel = new Date(Date.UTC(j, mo - 1 + k * m, 1));
    const letzter = new Date(Date.UTC(ziel.getUTCFullYear(), ziel.getUTCMonth() + 1, 0)).getUTCDate();
    ziel.setUTCDate(Math.min(t, letzter));
    const iso = ziel.toISOString().slice(0, 10);
    if (iso >= heute) return iso;
  }
  return null;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const [{ data: firma, error }, { data: fristen, error: fehlerFristen }, { data: personen }, { data: darf }] = await Promise.all([
    supabase.from("company_profile").select(FIRMA_SPALTEN).maybeSingle(),
    supabase.from("company_deadlines").select("id,title,note,first_due_on,repeat,lead_days,responsible_user,active,version").order("active", { ascending: false }).order("title"),
    supabase.from("profiles").select("user_id,display_name").eq("status", "ACTIVE").order("display_name"),
    supabase.rpc("current_user_has_permission", { p_permission: "settings.manage" }),
  ]);
  if (error || fehlerFristen) throw new Response("Firma & Fristen konnten nicht geladen werden.", { status: 500, headers: responseHeaders() });
  return data({
    firma: (firma ?? null) as Firma | null,
    fristen: (fristen ?? []) as Frist[],
    personen: (personen ?? []) as { user_id: string; display_name: string }[],
    darfPflegen: darf === true,
  }, { headers: responseHeaders() });
}

export async function action({ request, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const { data: darf } = await supabase.rpc("current_user_has_permission", { p_permission: "settings.manage" });
  if (darf !== true) return data<Ergebnis>({ error: "Ändern darf nur, wer die Verwaltung pflegen darf." }, { status: 403, headers: responseHeaders() });
  const fd = await request.formData();
  const absicht = text(fd, "_intent");
  const konflikt = () => data<Ergebnis>({ error: "Inzwischen von jemand anderem geändert. Bitte neu laden." }, { status: 409, headers: responseHeaders() });

  if (absicht === "firma") {
    const felder: Record<string, string | null> = {};
    for (const f of ["legal_name", "brand_name", "street", "postal_code", "city", "registered_seat", "register_court", "register_number", "managing_directors", "tax_number", "vat_id", "phone", "email", "website"]) felder[f] = oderNull(text(fd, f));
    const { data: geaendert, error } = await supabase.from("company_profile").update(felder).eq("id", text(fd, "id")).eq("version", Number(text(fd, "version"))).select("id").maybeSingle();
    if (error) return data<Ergebnis>({ error: "Die Firmenangaben konnten nicht gespeichert werden. Bitte die Länge der Angaben prüfen." }, { status: 400, headers: responseHeaders() });
    if (!geaendert) return konflikt();
    return redirect("/crm/firma?gespeichert=firma", { headers: responseHeaders() });
  }

  if (absicht === "frist") {
    const felder = {
      title: text(fd, "title"),
      note: oderNull(text(fd, "note")),
      first_due_on: text(fd, "first_due_on"),
      repeat: text(fd, "repeat"),
      lead_days: Number(text(fd, "lead_days") || "7"),
      responsible_user: oderNull(text(fd, "responsible_user")),
      active: text(fd, "active") === "1",
    };
    if (!felder.title) return data<Ergebnis>({ error: "Bitte eine Bezeichnung angeben." }, { status: 400, headers: responseHeaders() });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(felder.first_due_on)) return data<Ergebnis>({ error: "Bitte den (ersten) Fälligkeitstag angeben." }, { status: 400, headers: responseHeaders() });
    if (!(felder.repeat in RHYTHMUS)) return data<Ergebnis>({ error: "Bitte einen Rhythmus wählen." }, { status: 400, headers: responseHeaders() });
    if (!Number.isInteger(felder.lead_days) || felder.lead_days < 0 || felder.lead_days > 90) return data<Ergebnis>({ error: "Der Vorlauf muss zwischen 0 und 90 Tagen liegen." }, { status: 400, headers: responseHeaders() });
    if (felder.active && !felder.responsible_user) return data<Ergebnis>({ error: "Eine eingeschaltete Frist braucht einen Verantwortlichen – an ihn geht die Aufgabe." }, { status: 400, headers: responseHeaders() });
    const id = text(fd, "id");
    if (id) {
      const { data: geaendert, error } = await supabase.from("company_deadlines").update(felder).eq("id", id).eq("version", Number(text(fd, "version"))).select("id").maybeSingle();
      if (error) return data<Ergebnis>({ error: "Die Frist konnte nicht gespeichert werden." }, { status: 400, headers: responseHeaders() });
      if (!geaendert) return konflikt();
      return redirect(`/crm/firma?gespeichert=${id}#fristen`, { headers: responseHeaders() });
    }
    const { data: neu, error } = await supabase.from("company_deadlines").insert(felder).select("id").single();
    if (error || !neu) return data<Ergebnis>({ error: "Die Frist konnte nicht angelegt werden." }, { status: 400, headers: responseHeaders() });
    return redirect(`/crm/firma?gespeichert=${neu.id}#fristen`, { headers: responseHeaders() });
  }

  if (absicht === "frist_schalten") {
    const ein = text(fd, "active") === "1";
    const { data: geaendert, error } = await supabase.from("company_deadlines").update({ active: ein }).eq("id", text(fd, "id")).eq("version", Number(text(fd, "version"))).select("id").maybeSingle();
    if (error) return data<Ergebnis>({ error: ein && error.message.includes("company_deadlines_active_responsible") ? "Zum Einschalten zuerst einen Verantwortlichen eintragen (Bearbeiten)." : "Die Frist konnte nicht umgeschaltet werden." }, { status: 400, headers: responseHeaders() });
    if (!geaendert) return konflikt();
    return redirect("/crm/firma#fristen", { headers: responseHeaders() });
  }

  return data<Ergebnis>({ error: "Unbekannte Aktion." }, { status: 400, headers: responseHeaders() });
}

const FELDER: { name: keyof Firma; label: string; hilfe?: string; breit?: boolean }[] = [
  { name: "legal_name", label: "Vollständige Firma", hilfe: "So, wie sie im Handelsregister steht.", breit: true },
  { name: "brand_name", label: "Auftrittsname (optional)", hilfe: "Wie ihr nach außen auftretet, z. B. im Logo." },
  { name: "street", label: "Straße und Hausnummer" },
  { name: "postal_code", label: "Postleitzahl" },
  { name: "city", label: "Ort" },
  { name: "registered_seat", label: "Sitz der Gesellschaft" },
  { name: "register_court", label: "Registergericht" },
  { name: "register_number", label: "Registernummer", hilfe: "z. B. HRB 123456" },
  { name: "managing_directors", label: "Geschäftsführer", hilfe: "Vor- und Nachnamen, durch Komma getrennt.", breit: true },
  { name: "tax_number", label: "Steuernummer" },
  { name: "vat_id", label: "USt-IdNr." },
  { name: "phone", label: "Telefon" },
  { name: "email", label: "E-Mail" },
  { name: "website", label: "Website" },
];

export default function FirmaUndFristen() {
  const { firma, fristen, personen, darfPflegen } = useLoaderData<typeof loader>();
  const ergebnis = useActionData<typeof action>();
  const [suche] = useSearchParams();
  const gespeichert = suche.get("gespeichert");
  const bearbeiten = suche.get("frist");
  const fehlt = fehlendeAngaben(firma);
  const zeile = pflichtangaben(firma);
  const name = (id: string | null) => personen.find((p) => p.user_id === id)?.display_name ?? "—";
  const frist = bearbeiten && bearbeiten !== "neu" ? fristen.find((f) => f.id === bearbeiten) ?? null : null;

  return (
    <main className="editor-shell programm-liste firma-seite"><ListenUeberschrift />
      <p className="form-warning firma-hinweis">
        Das CRM prüft die Angaben und Termine nicht rechtlich oder steuerlich. Es zeigt, was fehlt, und erinnert an das, was eingetragen ist.
      </p>
      {ergebnis?.error ? <p className="form-error">{ergebnis.error}</p> : null}
      {gespeichert === "firma" ? <p className="form-success" role="status">Firmenangaben gespeichert. Sie gelten für neu erzeugte Exposés und neue E-Mails.</p> : null}

      <section className="data-card" aria-label="Firmenangaben" id="firma">
        <div className="card-head"><div><p className="eyebrow">An einer Stelle</p><h2>Firmenangaben</h2></div></div>
        <p className="form-help">Stehen in der Fußzeile neu erzeugter Exposés und im E-Mail-Platzhalter <code>{"{{firma_pflichtangaben}}"}</code>.</p>
        {fehlt.length ? <p className="form-warning">Noch leer: {fehlt.join(", ")}.</p> : <p className="form-success">Alle Kernangaben sind eingetragen.</p>}
        {zeile ? <p className="firma-vorschau"><span>So erscheint die Zeile:</span> {zeile}</p> : null}
        {firma && darfPflegen ? (
          <Form method="post" className="firma-formular">
            <input type="hidden" name="_intent" value="firma" />
            <input type="hidden" name="id" value={firma.id} />
            <input type="hidden" name="version" value={firma.version} />
            <div className="form-grid">
              {FELDER.map((f) => (
                <label key={f.name} className={`form-field${f.breit ? " full-width" : ""}`}>
                  <span>{f.label}</span>
                  <input name={f.name} defaultValue={(firma[f.name] as string | null) ?? ""} maxLength={f.name === "email" ? 254 : 300} />
                  {f.hilfe ? <small className="subtle">{f.hilfe}</small> : null}
                </label>
              ))}
            </div>
            <div className="form-actions"><button className="primary-button" type="submit">Firmenangaben speichern</button></div>
          </Form>
        ) : firma ? (
          <dl className="akte-felder">
            {FELDER.map((f) => <div key={f.name}><dt>{f.label}</dt><dd>{(firma[f.name] as string | null) || "—"}</dd></div>)}
          </dl>
        ) : <p className="form-error">Der Datensatz mit den Firmenangaben fehlt.</p>}
      </section>

      <section className="data-card" aria-label="Fristen des Unternehmens" id="fristen">
        <div className="card-head">
          <div><p className="eyebrow">Wiederkehrend</p><h2>Fristen des Unternehmens</h2></div>
          {darfPflegen && bearbeiten !== "neu" ? <Link className="programm-liste-neu" to="/crm/firma?frist=neu#frist-formular">+ Frist</Link> : null}
        </div>
        <p className="form-help">Für jede eingeschaltete Frist legt die tägliche Automatik vor der Fälligkeit einmal eine Aufgabe an (Vorlauf je Frist). Ausgeschaltete Fristen lösen nichts aus.</p>
        {fristen.length === 0 ? <p className="programm-liste-leer">Noch keine Frist eingetragen.</p> : (
          <div className="programm-tabelle-rahmen">
            <table className="programm-tabelle">
              <thead><tr><th>Frist</th><th>Rhythmus</th><th>Nächste Fälligkeit</th><th>Vorlauf</th><th>Verantwortlich</th><th>Stand</th>{darfPflegen ? <th><span className="sr-only">Aktionen</span></th> : null}</tr></thead>
              <tbody>
                {fristen.map((f) => {
                  const naechste = naechsteFaelligkeit(f.first_due_on, f.repeat);
                  return (
                    <tr key={f.id} className={gespeichert === f.id ? "firma-gespeichert" : undefined}>
                      <td>{darfPflegen ? <Link to={`/crm/firma?frist=${f.id}#frist-formular`}>{f.title}</Link> : <strong>{f.title}</strong>}{f.note ? <div className="leise">{f.note}</div> : null}</td>
                      <td>{RHYTHMUS[f.repeat] ?? f.repeat}</td>
                      <td className="zahl">{naechste ? tag(naechste) : "abgelaufen"}</td>
                      <td className="zahl">{f.lead_days} Tage</td>
                      <td>{name(f.responsible_user)}</td>
                      <td>{f.active ? "Eingeschaltet" : "Ausgeschaltet"}</td>
                      {darfPflegen ? (
                        <td className="rechts">
                          <Form method="post">
                            <input type="hidden" name="_intent" value="frist_schalten" />
                            <input type="hidden" name="id" value={f.id} />
                            <input type="hidden" name="version" value={f.version} />
                            <input type="hidden" name="active" value={f.active ? "0" : "1"} />
                            <button className="secondary-button compact" type="submit">{f.active ? "Ausschalten" : "Einschalten"}</button>
                          </Form>
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {darfPflegen && (bearbeiten === "neu" || frist) ? (
          <Form method="post" className="firma-formular" id="frist-formular">
            <h3>{frist ? `Frist bearbeiten: ${frist.title}` : "Neue Frist"}</h3>
            <input type="hidden" name="_intent" value="frist" />
            {frist ? <><input type="hidden" name="id" value={frist.id} /><input type="hidden" name="version" value={frist.version} /></> : null}
            <div className="form-grid">
              <label className="form-field full-width"><span>Bezeichnung *</span><input name="title" required maxLength={160} defaultValue={frist?.title ?? ""} placeholder="z. B. Umsatzsteuer-Voranmeldung" /></label>
              <label className="form-field"><span>(Erste) Fälligkeit *</span><input type="date" name="first_due_on" required defaultValue={frist?.first_due_on ?? ""} /></label>
              <label className="form-field"><span>Rhythmus</span><select name="repeat" defaultValue={frist?.repeat ?? "YEARLY"}>{Object.entries(RHYTHMUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="form-field"><span>Vorlauf in Tagen</span><input type="number" name="lead_days" min={0} max={90} defaultValue={frist?.lead_days ?? 7} /></label>
              <label className="form-field"><span>Verantwortlich</span><select name="responsible_user" defaultValue={frist?.responsible_user ?? ""}><option value="">—</option>{personen.map((p) => <option key={p.user_id} value={p.user_id}>{p.display_name}</option>)}</select></label>
              <label className="form-field full-width"><span>Notiz</span><textarea name="note" rows={3} maxLength={2000} defaultValue={frist?.note ?? ""} /></label>
              <label className="checkbox-row"><input type="checkbox" name="active" value="1" defaultChecked={frist?.active ?? false} /><span>Eingeschaltet (Aufgabe vor jeder Fälligkeit)</span></label>
            </div>
            <div className="inline-actions">
              <button className="primary-button" type="submit">{frist ? "Speichern" : "Frist anlegen"}</button>
              <Link className="secondary-button link-button" to="/crm/firma#fristen">Abbrechen</Link>
            </div>
          </Form>
        ) : null}
      </section>
    </main>
  );
}
