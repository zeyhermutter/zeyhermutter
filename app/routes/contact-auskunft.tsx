import { data, Form, Link, useActionData, useLoaderData, useNavigation } from "react-router";
import type { Route } from "./+types/contact-auskunft";
import { requireActiveUser, requirePermission } from "~/lib/auth.server";
import { ladeAuskunft, type Abschnitt } from "~/lib/auskunft.server";
import { tag, zeitpunkt } from "~/lib/format";
import { AKTIVITAETSART, ANFRAGEKANAL, ANFRAGESTATUS, AUFGABENSTATUS, BESICHTIGUNGSSTATUS, KAUFANGEBOTSTATUS, KONTAKTSTATUS, LEADSTATUS, RECHTSGRUNDLAGE, beschrifte, type Beschriftungen } from "~/lib/labels";
import "~/auskunft.css";

// Datenauskunft zu einem Kontakt (P2-6, 16.10.2026).
//
// Vorher: eine Auskunft nach Art. 15 DSGVO hieß, zwanzig Bereiche des CRM
// einzeln zu öffnen und abzuschreiben. Jetzt steht hier alles, was das CRM zu
// der Person speichert, auf einer Seite -- zum Drucken bzw. als PDF speichern --
// und als JSON-Datei zum Herunterladen.
//
// Das CRM beantwortet nicht, ob und wie eine Auskunft zu erteilen ist, und es
// schreibt kein Anschreiben dazu. Es stellt die Daten zusammen.
//
// DATENSCHUTZ-ANGABEN (P2-6 Teil 2, 17.10.2026)
//
// Auf derselben Seite, weil sie zur selben Anfrage der Person gehoeren:
// - Rechtsgrundlage: das Buero waehlt sie und kann eine Notiz dazuschreiben.
//   Das CRM prueft die Wahl nicht.
// - Werbewiderspruch: ein Datum. "E-Mail schreiben" warnt danach; es sperrt
//   nicht, denn eine Antwort auf eine Anfrage ist keine Werbung -- das
//   entscheidet das Buero.
// - Anonymisieren auf Antrag: nur mit dem Recht contact.anonymize, nur mit
//   Grund und eingetippter Kontaktnummer, nur wenn die Datenbank nichts
//   einwendet (Dokumente, Geldwaesche, umgewandelte Leads). Nicht umkehrbar.
//   Die Pruefung und die Arbeit macht die Datenbank (anonymize_contact); die
//   Seite zeigt nur, was sie sagt.

const recht = async (supabase: any, schluessel: string) =>
  (await supabase.rpc("current_user_has_permission", { p_permission: schluessel })).data === true;

type Pruefung = { moeglich: boolean; gruende: string[] } | null;

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requirePermission(request, context.cloudflare.env, "contact.read");
  const [auskunft, darfAendern, darfAnonymisieren] = await Promise.all([
    ladeAuskunft(supabase, params.contactId!),
    recht(supabase, "contact.write"),
    recht(supabase, "contact.anonymize"),
  ]);
  if (!auskunft) throw new Response("Kontakt nicht gefunden oder nicht lesbar.", { status: 404, headers: responseHeaders() });

  let pruefung: Pruefung = null;
  if (darfAnonymisieren) {
    const { data: p, error } = await supabase.rpc("contact_anonymization_check", { p_contact_id: params.contactId! });
    pruefung = error ? { moeglich: false, gruende: ["Die Prüfung konnte nicht geladen werden."] } : (p as Pruefung);
  }

  return data({ auskunft, von: profile.display_name, darfAendern, darfAnonymisieren, pruefung }, { headers: responseHeaders() });
}

type Ergebnis = { ok?: string; fehler?: string; umfang?: Record<string, number> };

const UMFANG: Record<string, string> = {
  anfragen: "Anfragen", leads: "Leads", kommentare: "Kommentare", verlauf: "Verlaufseinträge",
  anschriften: "Anschriften gelöscht", protokoll: "Protokolleinträge geschwärzt",
};

function anonymisierFehler(meldung: string): string {
  if (meldung.includes("ANONYMIZE_PERMISSION_MISSING")) return "Für das Anonymisieren fehlt das Recht.";
  if (meldung.includes("ANONYMIZE_REASON_REQUIRED")) return "Bitte einen Grund angeben.";
  if (meldung.includes("ANONYMIZE_BLOCKED")) return `Nicht möglich: ${meldung.replace(/^.*ANONYMIZE_BLOCKED:\s*/, "")}`;
  if (/archive permission/i.test(meldung)) return "Für das Archivieren von Kontakten fehlt das Recht; ohne es geht das Anonymisieren nicht.";
  if (/anonymize_contact/.test(meldung) && /(not find|does not exist|schema cache)/i.test(meldung)) return "Die Funktion zum Anonymisieren ist in der Datenbank noch nicht eingerichtet.";
  return "Das Anonymisieren ist fehlgeschlagen. Es wurde nichts geändert.";
}

export async function action({ request, params, context }: Route.ActionArgs) {
  const { supabase, responseHeaders } = await requireActiveUser(request, context.cloudflare.env);
  const kontaktId = params.contactId!;
  const form = await request.formData();
  const was = String(form.get("_intent") ?? "");
  const antwort = (e: Ergebnis, status = 200) => data<Ergebnis>(e, { status, headers: responseHeaders() });
  const version = Number(form.get("version"));

  if (was === "rechtsgrundlage" || was === "widerspruch") {
    if (!Number.isInteger(version)) return antwort({ fehler: "Ungültige Datensatzversion." }, 400);
    let aenderung: Record<string, unknown>;
    if (was === "rechtsgrundlage") {
      const grundlage = String(form.get("legal_basis") ?? "");
      const notiz = String(form.get("legal_basis_note") ?? "").trim();
      if (grundlage && !(grundlage in RECHTSGRUNDLAGE)) return antwort({ fehler: "Unbekannte Rechtsgrundlage." }, 400);
      if (notiz.length > 500) return antwort({ fehler: "Die Notiz darf höchstens 500 Zeichen haben." }, 400);
      aenderung = { legal_basis: grundlage || null, legal_basis_note: notiz || null };
    } else {
      aenderung = { marketing_objection_at: form.get("wert") === "setzen" ? new Date().toISOString() : null };
    }
    const { data: neu, error } = await supabase.from("contacts").update(aenderung)
      .eq("id", kontaktId).eq("version", version).is("anonymized_at", null).select("id").maybeSingle();
    if (error) return antwort({ fehler: "Speichern nicht möglich (fehlendes Recht oder Fehler)." }, 400);
    if (!neu) return antwort({ fehler: "Der Kontakt wurde inzwischen geändert. Bitte Seite neu laden." }, 409);
    return antwort({ ok: was === "rechtsgrundlage" ? "Rechtsgrundlage gespeichert." : aenderung.marketing_objection_at ? "Werbewiderspruch vermerkt." : "Werbewiderspruch aufgehoben." });
  }

  if (was === "anonymisieren") {
    const grund = String(form.get("grund") ?? "").trim();
    const bestaetigung = String(form.get("bestaetigung") ?? "").trim();
    const { data: k } = await supabase.from("contacts").select("contact_number").eq("id", kontaktId).maybeSingle();
    if (!k) return antwort({ fehler: "Kontakt nicht gefunden." }, 404);
    if (!grund) return antwort({ fehler: "Bitte einen Grund angeben." }, 400);
    if (bestaetigung.toUpperCase() !== String(k.contact_number).toUpperCase()) return antwort({ fehler: `Zur Bestätigung bitte die Kontaktnummer ${k.contact_number} eintippen.` }, 400);
    const { data: r, error } = await supabase.rpc("anonymize_contact", { p_contact_id: kontaktId, p_reason: grund.slice(0, 1000) });
    if (error) return antwort({ fehler: anonymisierFehler(`${error.message} ${error.details ?? ""}`) }, 400);
    return antwort({ ok: "Der Kontakt ist anonymisiert.", umfang: (r as any)?.umfang ?? {} });
  }

  return antwort({ fehler: "Unbekannte Aktion." }, 400);
}

// --- Lesbare Fassung --------------------------------------------------------

/** Technische Felder ohne Aussage für die betroffene Person; in der JSON-Datei bleiben sie. */
const TECHNISCH = /^(id|version|created_by|updated_by|archived_by|anonymized_by|storage_bucket|storage_path|sha256|search_vector|.*_id)$/;

const SPALTE: Record<string, string> = {
  contact_number: "Kontaktnummer", salutation: "Anrede", title: "Titel", first_name: "Vorname", last_name: "Nachname",
  email: "E-Mail", phone: "Telefon", mobile: "Mobil", birth_date: "Geburtsdatum", preferred_channel: "Bevorzugter Kanal",
  language: "Sprache", internal_notes: "Interne Notizen", status: "Stand", created_at: "Angelegt", updated_at: "Geändert",
  archived_at: "Archiviert", street: "Straße", house_number: "Hausnummer", postal_code: "PLZ", city: "Ort", country: "Land",
  message: "Nachricht", channel: "Kanal", source_label: "Quelle", received_at: "Eingegangen", answered_at: "Beantwortet",
  consent_given: "Einwilligung", consent_at: "Einwilligung am", consent_given_at: "Einwilligung am", consent_text_version: "Fassung des Einwilligungstexts",
  starts_at: "Beginn", ends_at: "Ende", meeting_point: "Treffpunkt", amount: "Betrag", due_at: "Fällig", description: "Beschreibung",
  occurred_at: "Zeitpunkt", activity_type: "Art", body: "Text", lead_number: "Lead-Nummer", inquiry_number: "Anfragenummer",
  viewing_number: "Besichtigungsnummer", offer_number: "Angebotsnummer", task_number: "Aufgabennummer", disclosed_at: "Nachgewiesen am",
  legal_basis: "Rechtsgrundlage", legal_basis_note: "Notiz zur Rechtsgrundlage", marketing_objection_at: "Werbewiderspruch seit",
  anonymized_at: "Anonymisiert am",
  ownership_percentage: "Anteil in %", follow_up_at: "Wiedervorlage", lost_reason: "Grund", notes: "Notizen", metadata: "Weitere Angaben",
};

const WERTE: Record<string, Record<string, Beschriftungen>> = {
  leads: { status: LEADSTATUS },
  anfragen: { status: ANFRAGESTATUS, channel: ANFRAGEKANAL },
  besichtigungen: { status: BESICHTIGUNGSSTATUS },
  aufgaben: { status: AUFGABENSTATUS },
  kaufangebote: { status: KAUFANGEBOTSTATUS },
  verlauf: { activity_type: AKTIVITAETSART },
};

// Stammdaten haben keinen eigenen Abschnitt in WERTE.
const KONTAKTWERTE: Record<string, Beschriftungen> = { status: KONTAKTSTATUS, legal_basis: RECHTSGRUNDLAGE };

const ZEITPUNKT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

function wert(abschnitt: string, spalte: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  if (typeof v === "string") {
    const tabelle = WERTE[abschnitt]?.[spalte] ?? (abschnitt === "kontakt" ? KONTAKTWERTE[spalte] : undefined);
    if (tabelle) return beschrifte(tabelle, v);
    if (ZEITPUNKT.test(v)) return zeitpunkt(v);
    if (DATUM.test(v)) return tag(v);
    return v;
  }
  if (typeof v === "number") return String(v).replace(".", ",");
  const s = JSON.stringify(v);
  return s === "{}" || s === "[]" ? "" : s;
}

function Felder({ abschnitt, zeile }: { abschnitt: string; zeile: Record<string, unknown> }) {
  const eintraege = Object.entries(zeile)
    .filter(([k]) => !TECHNISCH.test(k))
    .map(([k, v]) => [SPALTE[k] ?? k.replace(/_/g, " "), wert(abschnitt, k, v)] as const)
    .filter(([, v]) => v !== "");
  return <dl className="auskunft-felder">{eintraege.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}</dl>;
}

function Bereich({ a }: { a: Abschnitt }) {
  return (
    <section className="auskunft-bereich" aria-label={a.titel}>
      <h2>{a.titel} <span>{a.fehler ? "nicht gelesen" : `${a.zeilen.length}${a.gekappt ? "+" : ""}`}</span></h2>
      {a.fehler ? <p className="form-warning">Dieser Bereich konnte nicht gelesen werden (fehlendes Recht oder Fehler). Die Auskunft ist in diesem Punkt unvollständig.</p> : null}
      {a.gekappt ? <p className="form-warning">Mehr als 1.000 Einträge – hier ist nur ein Teil aufgeführt. Die Auskunft ist in diesem Punkt unvollständig.</p> : null}
      {a.zeilen.map((z, i) => <Felder key={i} abschnitt={a.schluessel} zeile={z} />)}
    </section>
  );
}

function DatenschutzAngaben({ k, darfAendern, darfAnonymisieren, pruefung }: { k: Record<string, any>; darfAendern: boolean; darfAnonymisieren: boolean; pruefung: Pruefung }) {
  const ergebnis = useActionData<typeof action>() as Ergebnis | undefined;
  const nav = useNavigation();
  const laeuft = nav.state !== "idle";
  const anonymisiert = Boolean(k.anonymized_at);
  const gesperrt = !darfAendern || anonymisiert;

  return (
    <section className="auskunft-bereich auskunft-nicht-drucken datenschutz-angaben" id="datenschutz-angaben" aria-label="Datenschutz-Angaben">
      <h2>Datenschutz-Angaben</h2>
      {ergebnis?.fehler ? <p className="form-error" role="alert">{ergebnis.fehler}</p> : null}
      {ergebnis?.ok ? (
        <p className="form-success" role="status">
          {ergebnis.ok}
          {ergebnis.umfang ? ` ${Object.entries(ergebnis.umfang).filter(([, n]) => n > 0).map(([s, n]) => `${UMFANG[s] ?? s}: ${n}`).join(" · ")}` : null}
        </p>
      ) : null}
      {anonymisiert ? <p className="form-warning">Dieser Kontakt wurde am {zeitpunkt(k.anonymized_at)} auf Antrag anonymisiert. Angaben zur Person sind nicht mehr gespeichert.</p> : null}

      <div className="datenschutz-raster">
        <Form method="post" className="datenschutz-karte">
          <h3>Rechtsgrundlage</h3>
          <input type="hidden" name="_intent" value="rechtsgrundlage" />
          <input type="hidden" name="version" value={k.version} />
          <label className="form-field"><span>Grundlage der Verarbeitung</span>
            <select name="legal_basis" defaultValue={k.legal_basis ?? ""} disabled={gesperrt}>
              <option value="">Nicht erfasst</option>
              {Object.entries(RECHTSGRUNDLAGE).map(([w, t]) => <option key={w} value={w}>{t}</option>)}
            </select>
          </label>
          <label className="form-field"><span>Notiz (z. B. Vertrag, Datum der Einwilligung)</span>
            <textarea name="legal_basis_note" rows={2} maxLength={500} defaultValue={k.legal_basis_note ?? ""} disabled={gesperrt} />
          </label>
          <p className="form-help">Die Auswahl trifft das Büro. Das CRM prüft sie nicht.</p>
          {gesperrt ? null : <button className="secondary-button" type="submit" disabled={laeuft}>Speichern</button>}
        </Form>

        <Form method="post" className="datenschutz-karte">
          <h3>Werbewiderspruch</h3>
          <input type="hidden" name="_intent" value="widerspruch" />
          <input type="hidden" name="version" value={k.version} />
          {k.marketing_objection_at
            ? <p><strong>Widersprochen am {zeitpunkt(k.marketing_objection_at)}.</strong> „E-Mail schreiben“ weist bei diesem Kontakt darauf hin.</p>
            : <p>Kein Widerspruch vermerkt.</p>}
          <p className="form-help">Vermerkt, wenn die Person keine Werbung mehr erhalten möchte. Ob eine Nachricht Werbung ist, entscheidet das Büro.</p>
          {gesperrt ? null : (
            <button className="secondary-button" type="submit" name="wert" value={k.marketing_objection_at ? "aufheben" : "setzen"} disabled={laeuft}>
              {k.marketing_objection_at ? "Widerspruch aufheben" : "Widerspruch vermerken (heute)"}
            </button>
          )}
        </Form>
      </div>

      {darfAnonymisieren && !anonymisiert ? (
        <details className="datenschutz-anonymisieren">
          <summary>Auf Antrag anonymisieren …</summary>
          <p className="form-help">
            Überschreibt Name, Erreichbarkeit, Anschriften, Notizen und Freitexte zu dieser Person und schwärzt sie im Änderungsprotokoll.
            Anfragen, Besichtigungen, Aufgaben und Zahlen bleiben ohne Personenbezug erhalten. Der Kontakt wird archiviert.
            <strong> Das lässt sich nicht rückgängig machen.</strong> Ob ein Antrag zu erfüllen ist, entscheidet das Büro.
          </p>
          {pruefung && !pruefung.moeglich ? (
            <div className="form-warning">
              <p>Derzeit nicht möglich:</p>
              <ul>{pruefung.gruende.map((g) => <li key={g}>{g}</li>)}</ul>
            </div>
          ) : (
            <Form method="post" className="datenschutz-karte">
              <input type="hidden" name="_intent" value="anonymisieren" />
              <label className="form-field"><span>Grund *</span>
                <textarea name="grund" rows={2} maxLength={1000} required placeholder="z. B. Antrag der Person vom …" />
              </label>
              <label className="form-field"><span>Zur Bestätigung die Kontaktnummer eintippen *</span>
                <input name="bestaetigung" required autoComplete="off" placeholder={k.contact_number} />
              </label>
              <button className="danger-button" type="submit" disabled={laeuft}>Endgültig anonymisieren</button>
            </Form>
          )}
        </details>
      ) : null}
    </section>
  );
}

export default function KontaktAuskunft() {
  const { auskunft, von, darfAendern, darfAnonymisieren, pruefung } = useLoaderData<typeof loader>();
  const k = auskunft.kontakt as Record<string, any>;
  const mitDaten = auskunft.abschnitte.filter((a) => a.zeilen.length || a.fehler);
  const ohne = auskunft.abschnitte.filter((a) => !a.zeilen.length && !a.fehler);

  return (
    <main className="editor-shell auskunft">
      <header className="editor-header">
        <div>
          <Link className="back-link auskunft-nicht-drucken" to={`/crm/contacts/${k.id}`}>← Kontakt</Link>
          <h1 className="editor-title">Datenauskunft: {[k.first_name, k.last_name].filter(Boolean).join(" ")}</h1>
          <p className="editor-meta">{k.contact_number} · erstellt {zeitpunkt(auskunft.erstellt)} von {von}</p>
        </div>
        <div className="inline-actions auskunft-nicht-drucken">
          <button className="secondary-button" type="button" onClick={() => window.print()}>Drucken / als PDF speichern</button>
          <a className="primary-button link-button" href={`/crm/contacts/${k.id}/auskunft/datei`} download>Als Datei (JSON)</a>
        </div>
      </header>

      <p className="form-help auskunft-nicht-drucken">
        Alles, was das CRM zu dieser Person speichert, aus {auskunft.abschnitte.length + 1} Bereichen. Dateien sind mit ihren Angaben aufgeführt, nicht als Datei. Das CRM prüft nicht, ob und in welchem Umfang eine Auskunft zu erteilen ist, und schreibt kein Anschreiben. Das Herunterladen der Datei wird im Verlauf des Kontakts festgehalten.
      </p>
      {auskunft.nichtGelesen.length ? <p className="form-error">Nicht vollständig gelesen: {auskunft.nichtGelesen.join(", ")}.</p> : null}

      <DatenschutzAngaben k={k} darfAendern={darfAendern} darfAnonymisieren={darfAnonymisieren} pruefung={pruefung} />

      <section className="auskunft-bereich" aria-label="Stammdaten">
        <h2>Stammdaten</h2>
        <Felder abschnitt="kontakt" zeile={k} />
      </section>

      <section className="auskunft-bereich" aria-label="Einwilligungen">
        <h2>Einwilligungen aus Formularen <span>{auskunft.einwilligungen.length}</span></h2>
        {auskunft.einwilligungen.length === 0 ? <p className="leise">Keine Einwilligung über ein Formular der Website erfasst.</p> : (
          <table className="auskunft-tabelle">
            <thead><tr><th>Herkunft</th><th>Nummer</th><th>Erteilt am</th><th>Fassung des Texts</th></tr></thead>
            <tbody>{auskunft.einwilligungen.map((e, i) => <tr key={i}><td>{e.quelle}</td><td>{e.nummer ?? "—"}</td><td>{e.erteilt ? zeitpunkt(e.erteilt) : "—"}</td><td>{e.fassung ?? "—"}</td></tr>)}</tbody>
          </table>
        )}
      </section>

      {mitDaten.map((a) => <Bereich key={a.schluessel} a={a} />)}

      <section className="auskunft-bereich" aria-label="Ohne Einträge">
        <h2>Ohne Einträge</h2>
        <p className="leise">{ohne.map((a) => a.titel).join(" · ") || "—"}</p>
      </section>
    </main>
  );
}
