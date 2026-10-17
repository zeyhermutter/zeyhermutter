import { Form, Link } from "react-router";
import { euroRund, tag, zeitpunkt } from "~/lib/format";
import { standKlasse } from "~/lib/stand-ton";
import { AKTIVITAETSART, ANFRAGESTATUS, BESICHTIGUNGSSTATUS, IMMOBILIENSTATUS, beschrifte } from "~/lib/labels";
import "~/programm-liste.css";
import "~/akte-blick.css";

// Die erste Karte der Objektakte (P1, 14.10.2026).
//
// WARUM
//
// Wer ein Objekt oeffnete, sah oben sechs Statusknoepfe -- "Verloren" und
// "Archiviert" als erste Aktion der Akte -- und darunter den Fahrplan. Preis,
// Flaeche, Eigentuemer, Anfragen, Besichtigungen und Aktivitaeten standen
// nicht auf der Uebersicht; der Audit vom 14.10. zaehlte 6 von 11 Fragen
// der idealen Objektansicht als "nicht beantwortet".
//
// Diese Karte beantwortet sie, ohne etwas zu aendern -- bis auf den Status,
// der von der eigenen Karte hierher zieht, zugeklappt.

type Kontakt = { id: string; first_name: string; last_name: string } | null;
export type ObjektBlick = {
  eigentuemer: { id: string; contact_id: string; name: string; telefon: string | null; email: string | null; anteil: number | null; haupt: boolean }[];
  anfragen: { id: string; inquiry_number: string; status: string; received_at: string; answered_at: string | null; contact_id: string; contacts: Kontakt | Kontakt[] }[];
  besichtigungen: { id: string; viewing_number: string; status: string; starts_at: string; contact_id: string; contacts: Kontakt | Kontakt[] }[];
  angebotKontakte: string[];
  aktiveAngebote: number;
  aktivitaeten: { id: string; activity_type: string; title: string | null; occurred_at: string }[];
  dokumente: number | null;
  fehlt: boolean;
  /** Genaue Zahlen aus der Datenbank (Lasttest P2-7). Die Listen oben sind gekappt. */
  offeneAnfragenZahl?: number | null;
  kommendZahl?: number | null;
  interessentenZahl?: number | null;
  interessentenGekappt?: boolean;
};

export const OFFEN_ANFRAGE = ["NEW", "CONTACTED", "QUALIFIED", "VIEWING_PLANNED"];
export const KOMMEND = ["PLANNED", "CONFIRMED"];
const eins = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
const person = (k: Kontakt | Kontakt[]) => { const c = eins(k); return c ? `${c.first_name} ${c.last_name}` : "Kontakt"; };
const zahl = (n: unknown, einheit: string) => (n === null || n === undefined || n === "" ? null : `${Number(n).toLocaleString("de-DE", { maximumFractionDigits: 1 })} ${einheit}`);

type Schritt = { wann: string; was: string; wo: string; pfad: string };

export function ObjektAufEinenBlick({ id, p, blick, aufgaben, uebergaenge, jetzt, aufgabeAnlegen }: {
  /** Anker, auf den die Akte nach einem Statuswechsel zurueckfuehrt. */
  id: string;
  p: any;
  blick: ObjektBlick;
  aufgaben: { id: string; task_number: string; title: string; due_at: string | null }[] | null;
  uebergaenge: { to_status: string; description: string | null }[];
  jetzt: string;
  /** "+ Aufgabe" zeigen -- oeffnet das Formular im Aufgaben-Baustein. */
  aufgabeAnlegen?: boolean;
}) {
  const heute = jetzt.slice(0, 10);
  const basis = `/properties/${p.id}`;
  const miete = p.transaction_type === "RENT";

  const eckdaten = [
    miete ? (p.rent_cold != null ? `${euroRund(p.rent_cold)} kalt / Monat` : "Miete offen") : (p.purchase_price != null ? euroRund(p.purchase_price) : "Preis offen"),
    zahl(p.living_area_sqm, "m² Wohnfläche"),
    p.rooms != null ? `${Number(p.rooms).toLocaleString("de-DE")} Zimmer` : null,
    zahl(p.plot_area_sqm, "m² Grundstück"),
  ].filter(Boolean).join(" · ");

  const offeneAnfragen = blick.anfragen.filter((a) => OFFEN_ANFRAGE.includes(a.status));
  const kommend = blick.besichtigungen.filter((b) => KOMMEND.includes(b.status) && b.starts_at >= jetzt)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  // Interessenten: jede Person mit Anfrage, Besichtigung oder Kaufangebot zu
  // diesem Objekt -- einmal gezaehlt.
  const interessenten = blick.interessentenZahl ?? new Set([
    ...blick.anfragen.map((a) => a.contact_id), ...blick.besichtigungen.map((b) => b.contact_id), ...blick.angebotKontakte,
  ].filter(Boolean)).size;
  const offeneAnfragenZahl = blick.offeneAnfragenZahl ?? offeneAnfragen.length;
  const kommendZahl = blick.kommendZahl ?? kommend.length;
  // Sind die Listen gekappt, waere "danach 49 weitere" falsch -- dann ohne Zahl.
  const gekappt = offeneAnfragenZahl > offeneAnfragen.length || kommendZahl > kommend.length;
  const offeneAufgaben = aufgaben ?? [];
  const ueberfaellig = offeneAufgaben.filter((a) => a.due_at && a.due_at.slice(0, 10) < heute).length;

  const schritte: Schritt[] = [
    ...offeneAufgaben.filter((a) => a.due_at).map((a) => ({ wann: a.due_at!, was: a.title, wo: `Aufgabe ${a.task_number}`, pfad: "#aufgaben" })),
    ...kommend.map((b) => ({ wann: b.starts_at, was: `Besichtigung mit ${person(b.contacts)}`, wo: b.viewing_number, pfad: `/viewings/${b.id}` })),
    ...offeneAnfragen.filter((a) => a.status === "NEW" && !a.answered_at).map((a) => ({ wann: a.received_at, was: `Anfrage von ${person(a.contacts)} beantworten`, wo: a.inquiry_number, pfad: `/inquiries/${a.id}` })),
  ].sort((a, b) => a.wann.localeCompare(b.wann));
  const naechster = schritte[0] ?? null;
  const zuSpaet = naechster ? naechster.wann.slice(0, 10) < heute : false;

  return (
    <section className="data-card akte-blick" id={id} aria-label="Auf einen Blick">
      {blick.fehlt ? <p className="form-warning">Ein Teil dieser Karte konnte gerade nicht geladen werden. Die übrigen Angaben stimmen.</p> : null}
      <div className="akte-blick-kopf">
        <div>
          <p className="akte-blick-satz">{eckdaten}</p>
          <p className="akte-blick-erreichbar">
            {blick.eigentuemer.length === 0
              ? <span className="leise">Kein Eigentümer erfasst · <Link to={`${basis}/eigentuemer`}>erfassen</Link></span>
              : blick.eigentuemer.map((e) => (
                  <span key={e.id}>
                    <span className="leise">{e.haupt && blick.eigentuemer.length > 1 ? "Haupteigentümer " : "Eigentümer "}</span>
                    <Link to={`/crm/contacts/${e.contact_id}`}>{e.name}</Link>
                    {e.anteil !== null && blick.eigentuemer.length > 1 ? <span className="leise"> ({Number(e.anteil).toLocaleString("de-DE")} %)</span> : null}
                    {e.telefon ? <> · <a href={`tel:${e.telefon.replace(/[^+\d]/g, "")}`}>{e.telefon}</a></> : null}
                  </span>
                ))}
          </p>
        </div>
        <div className="akte-blick-aktionen">
          {aufgabeAnlegen ? <a className="secondary-button link-button compact" href="#aufgabe-neu">+ Aufgabe</a> : null}
          {p.status === "ARCHIVED" && p.status_before_archive ? (
            <Form method="post">
              <input type="hidden" name="_intent" value="status" />
              <input type="hidden" name="version" value={p.version} />
              <input type="hidden" name="target_status" value={p.status_before_archive} />
              <button className="secondary-button compact" type="submit">Wiederherstellen → {beschrifte(IMMOBILIENSTATUS, p.status_before_archive)}</button>
            </Form>
          ) : uebergaenge.length ? (
            <details className="akte-blick-status">
              <summary>Status ändern</summary>
              <div className="inline-actions">
                {uebergaenge.map((t) => (
                  <Form method="post" key={t.to_status}>
                    <input type="hidden" name="_intent" value="status" />
                    <input type="hidden" name="version" value={p.version} />
                    <input type="hidden" name="target_status" value={t.to_status} />
                    <button className="secondary-button compact" type="submit" title={t.description ?? ""}>→ {beschrifte(IMMOBILIENSTATUS, t.to_status)}</button>
                  </Form>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      </div>

      <p className="programm-kennzahlen akte-blick-zahlen">
        <Link to={`${basis}/interests`}><strong>{interessenten}{blick.interessentenGekappt ? "+" : ""}</strong> Interessenten</Link>
        <a href="#interessenten-lage"><strong>{offeneAnfragenZahl}</strong> offene Anfragen</a>
        <a href="#interessenten-lage"><strong>{kommendZahl}</strong> anstehende Besichtigungen</a>
        <a href="#fahrplan"><strong>{blick.aktiveAngebote}</strong> Kaufangebote im Lauf</a>
        <a href="#aufgaben" className={ueberfaellig ? "warnung" : undefined}><strong>{aufgaben ? offeneAufgaben.length : "—"}</strong> offene Aufgaben{ueberfaellig ? `, ${ueberfaellig} überfällig` : ""}</a>
        {blick.dokumente !== null ? <Link to={`${basis}/documents`}><strong>{blick.dokumente}</strong> Dokumente</Link> : null}
      </p>

      <div className={`akte-naechster${zuSpaet ? " ueberfaellig" : ""}`}>
        <span>Als Nächstes fällig</span>
        {naechster ? <>
          {naechster.pfad.startsWith("#") ? <a href={naechster.pfad}><strong>{naechster.was}</strong></a> : <Link to={naechster.pfad}><strong>{naechster.was}</strong></Link>}
          <small>{naechster.wo} · {zuSpaet ? "überfällig seit " : ""}{zeitpunkt(naechster.wann)}{gekappt ? " · danach weitere" : schritte.length > 1 ? ` · danach ${schritte.length - 1} weitere` : ""}</small>
        </> : <>
          <strong>Nichts mit Datum geplant</strong>
          <small>Keine Aufgabe mit Fälligkeit, keine anstehende Besichtigung, keine unbeantwortete Anfrage. Der Fahrplan darunter zeigt den nächsten Vorgang.</small>
        </>}
      </div>
    </section>
  );
}

// Anfragen, Besichtigungen und Aktivitaeten des Objekts -- die Antwort auf
// "wer interessiert sich, und was ist zuletzt passiert".
export function ObjektInteressentenLage({ p, blick, jetzt }: { p: any; blick: ObjektBlick; jetzt: string }) {
  const basis = `/properties/${p.id}`;
  const offen = blick.anfragen.filter((a) => OFFEN_ANFRAGE.includes(a.status));
  const kommend = blick.besichtigungen.filter((b) => KOMMEND.includes(b.status) && b.starts_at >= jetzt)
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const zeilen = [
    ...kommend.slice(0, 5).map((b) => ({ id: b.id, pfad: `/viewings/${b.id}`, art: "Besichtigung", titel: person(b.contacts), zusatz: `${b.viewing_number} · ${zeitpunkt(b.starts_at)}`, stand: beschrifte(BESICHTIGUNGSSTATUS, b.status) })),
    ...offen.slice(0, 5).map((a) => ({ id: a.id, pfad: `/inquiries/${a.id}`, art: "Anfrage", titel: person(a.contacts), zusatz: `${a.inquiry_number} · eingegangen ${tag(a.received_at)}`, stand: beschrifte(ANFRAGESTATUS, a.status) })),
  ];
  return (
    <>
      <section className="data-card" id="interessenten-lage">
        <div className="card-head">
          <div><p className="eyebrow">Wer interessiert sich</p><h2>Anfragen & Besichtigungen</h2></div>
          <Link className="subtle-link" to={`${basis}/interests`}>Interessenten →</Link>
        </div>
        {(blick.offeneAnfragenZahl ?? offen.length) > 5 || (blick.kommendZahl ?? kommend.length) > 5
          ? <p className="form-help">Es stehen je bis zu 5 hier: die nächsten Besichtigungen und die ältesten offenen Anfragen
              (insgesamt {blick.kommendZahl ?? kommend.length} anstehend, {blick.offeneAnfragenZahl ?? offen.length} offen). Alle unter <Link to={`${basis}/interests`}>Interessenten</Link>.</p>
          : null}
        {zeilen.length === 0
          ? <p className="empty-state">Keine offene Anfrage und keine anstehende Besichtigung.</p>
          : <div className="data-list">{zeilen.map((z) => (
              <Link className="data-row data-row-link" to={z.pfad} key={`${z.art}-${z.id}`}>
                <div><small className="akte-art">{z.art}</small><strong>{z.titel}</strong><small>{z.zusatz}</small></div>
                <div className="row-meta"><span className={`status-pill ${standKlasse(z.stand)}`}>{z.stand}</span></div>
              </Link>
            ))}</div>}
      </section>
      <section className="data-card" id="aktivitaeten">
        <div className="card-head">
          <div><p className="eyebrow">Zuletzt passiert</p><h2>{blick.aktivitaeten[0] ? `Letzte Aktivität ${tag(blick.aktivitaeten[0].occurred_at)}` : "Noch keine Aktivität"}</h2></div>
        </div>
        {blick.aktivitaeten.length === 0
          ? <p className="empty-state">Telefonate, E-Mails und Notizen zu diesem Objekt erscheinen hier, sobald sie erfasst sind.</p>
          : <div className="data-list">{blick.aktivitaeten.map((v) => (
              <div className="data-row" key={v.id}>
                <div><strong>{v.title ?? AKTIVITAETSART[v.activity_type] ?? "Eintrag"}</strong><small>{AKTIVITAETSART[v.activity_type] ?? "Eintrag"} · {zeitpunkt(v.occurred_at)}</small></div>
              </div>
            ))}</div>}
      </section>
    </>
  );
}
