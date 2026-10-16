import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/contact-auskunft";
import { requirePermission } from "~/lib/auth.server";
import { ladeAuskunft, type Abschnitt } from "~/lib/auskunft.server";
import { tag, zeitpunkt } from "~/lib/format";
import { AKTIVITAETSART, ANFRAGEKANAL, ANFRAGESTATUS, AUFGABENSTATUS, BESICHTIGUNGSSTATUS, KAUFANGEBOTSTATUS, KONTAKTSTATUS, LEADSTATUS, beschrifte, type Beschriftungen } from "~/lib/labels";
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

export async function loader({ request, params, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requirePermission(request, context.cloudflare.env, "contact.read");
  const auskunft = await ladeAuskunft(supabase, params.contactId!);
  if (!auskunft) throw new Response("Kontakt nicht gefunden oder nicht lesbar.", { status: 404, headers: responseHeaders() });

  return data({ auskunft, von: profile.display_name }, { headers: responseHeaders() });
}

// --- Lesbare Fassung --------------------------------------------------------

/** Technische Felder ohne Aussage für die betroffene Person; in der JSON-Datei bleiben sie. */
const TECHNISCH = /^(id|version|created_by|updated_by|archived_by|storage_bucket|storage_path|sha256|search_vector|.*_id)$/;

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

const ZEITPUNKT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;
const DATUM = /^\d{4}-\d{2}-\d{2}$/;

function wert(abschnitt: string, spalte: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "boolean") return v ? "Ja" : "Nein";
  if (typeof v === "string") {
    const tabelle = WERTE[abschnitt]?.[spalte] ?? (abschnitt === "kontakt" && spalte === "status" ? KONTAKTSTATUS : undefined);
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

export default function KontaktAuskunft() {
  const { auskunft, von } = useLoaderData<typeof loader>();
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
