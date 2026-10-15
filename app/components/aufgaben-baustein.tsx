import { useEffect, useState } from "react";
import { Form, Link, useLocation, useNavigate, useSearchParams } from "react-router";
import { TaskModal } from "~/components/task-modal";
import { tag } from "~/lib/format";
import { crmToday } from "~/lib/local-time";
import { AUFGABENPRIORITAET, AUFGABENSTATUS, beschrifte } from "~/lib/labels";
import "~/programm-liste.css";
import "~/aufgaben-baustein.css";

// Der Aufgaben-Baustein -- dieselbe Aufgabenliste in jeder Akte (P1,
// 14.10.2026).
//
// Vorher: fuenf eigene Formulare (Kontakt, Lead, Anfrage, Besichtigung,
// Suchprofil), mal mit Datum, mal mit Datum und Uhrzeit, mal mit
// Beschreibung, mal ohne; Abhaken nur ueber ein Fenster oder gar nicht; in
// Objekt- und Kontakt-Uebersicht konnte man Aufgaben nur ansehen.
//
// Jetzt: oben "+ Aufgabe" (Titel und Faelligkeit genuegen, der Rest ist
// vorbelegt), jede offene Aufgabe mit Haken in der Zeile, die Details wie
// bisher im Aufgabenfenster. Erledigte Aufgaben bleiben zugeklappt
// erreichbar. Gespeichert wird zentral ueber /api/aufgaben.

export type BausteinAufgabe = {
  id: string; task_number: string; title: string; description?: string | null;
  status: string; priority: string; due_at: string | null; responsible_user: string | null; version?: number;
};
type Art = "contact" | "lead" | "inquiry" | "viewing" | "search_profile" | "property";

const MELDUNG: Record<string, { text: string; klasse: string }> = {
  angelegt: { text: "Aufgabe angelegt.", klasse: "form-success" },
  erledigt: { text: "Aufgabe erledigt.", klasse: "form-success" },
  geaendert: { text: "Aufgabe aktualisiert.", klasse: "form-success" },
  unvollstaendig: { text: "Titel und Fälligkeit sind nötig.", klasse: "form-error" },
  konflikt: { text: "Die Aufgabe wurde inzwischen geändert. Die Liste zeigt jetzt den aktuellen Stand.", klasse: "form-warning" },
  fehler: { text: "Die Aufgabe konnte nicht gespeichert werden.", klasse: "form-error" },
};

export function AufgabenBaustein({
  aufgaben, art, id, nutzer, ich, darfSchreiben, kontextName, vorschlagTitel, vorschlagFaellig, verantwortlich,
}: {
  /** null = konnte nicht geladen werden. */
  aufgaben: BausteinAufgabe[] | null;
  art: Art;
  id: string;
  nutzer: { user_id: string; display_name: string }[];
  ich: string;
  darfSchreiben: boolean;
  /** Fuer das Aufgabenfenster, z. B. "Besichtigung ZM-B-000012". */
  kontextName?: string;
  vorschlagTitel?: string;
  /** YYYY-MM-DD */
  vorschlagFaellig?: string | null;
  verantwortlich?: string | null;
}) {
  const ort = useLocation();
  const navigate = useNavigate();
  const [suche] = useSearchParams();
  // Rueckfrage "gibt es schon" vom Server: Formular offen, Eingaben wieder da.
  const doppelt = suche.get("aufgabe") === "doppelt" ? {
    nr: suche.get("doppelt_nr") ?? "", wer: suche.get("doppelt_wer") ?? "",
    titel: suche.get("titel") ?? "", faellig: suche.get("faellig") ?? "", uhrzeit: suche.get("uhrzeit") ?? "",
    prioritaet: suche.get("prioritaet") ?? "", verantwortlich: suche.get("verantwortlich") ?? "", beschreibung: suche.get("beschreibung") ?? "",
  } : null;
  const [offen, setOffen] = useState(Boolean(doppelt));
  // "#aufgabe-neu" oeffnet das Formular -- so fuehrt "+ Aufgabe" im Kopf
  // einer Akte direkt hierher.
  useEffect(() => {
    const pruefe = () => { if (window.location.hash === "#aufgabe-neu") setOffen(true); };
    pruefe();
    window.addEventListener("hashchange", pruefe);
    return () => window.removeEventListener("hashchange", pruefe);
  }, []);
  const heute = crmToday();
  const zurueck = (() => {
    const p = new URLSearchParams(ort.search);
    for (const k of ["aufgabe", "doppelt_nr", "doppelt_wer", "titel", "faellig", "uhrzeit", "prioritaet", "verantwortlich", "beschreibung"]) p.delete(k);
    const q = p.toString();
    return `${ort.pathname}${q ? `?${q}` : ""}`;
  })();
  const meldung = MELDUNG[suche.get("aufgabe") ?? ""] ?? null;
  const name = (u: string | null) => nutzer.find((n) => n.user_id === u)?.display_name ?? "—";

  const alle = aufgaben ?? [];
  const laufend = alle.filter((a) => a.status === "OPEN" || a.status === "IN_PROGRESS");
  const fertig = alle.filter((a) => a.status === "DONE" || a.status === "CANCELLED");
  const ueberfaellig = laufend.filter((a) => a.due_at && a.due_at.slice(0, 10) < heute).length;

  const zeile = (a: BausteinAufgabe, abhakbar: boolean) => {
    const faellig = a.due_at ? a.due_at.slice(0, 10) : null;
    const zuSpaet = abhakbar && faellig !== null && faellig < heute;
    return (
      <div className={`data-row aufgaben-zeile${abhakbar ? "" : " erledigt"}`} key={a.id}>
        {abhakbar && darfSchreiben ? (
          <Form method="post" action="/api/aufgaben" className="aufgaben-haken">
            <input type="hidden" name="_intent" value="erledigt" />
            <input type="hidden" name="zurueck" value={zurueck} />
            <input type="hidden" name="task_id" value={a.id} />
            <input type="hidden" name="task_version" value={a.version ?? 1} />
            <button type="submit" aria-label={`„${a.title}“ als erledigt abhaken`} title="Erledigt" />
          </Form>
        ) : <span className="aufgaben-haken-platz" aria-hidden="true">{abhakbar ? "" : "✓"}</span>}
        <div>
          <strong>{a.title}</strong>
          <small>{a.task_number} · {name(a.responsible_user)}{a.status === "IN_PROGRESS" ? " · in Bearbeitung" : ""}{!abhakbar ? ` · ${beschrifte(AUFGABENSTATUS, a.status)}` : ""}</small>
        </div>
        <div className="row-meta">
          {abhakbar ? <span className={`prioritaet prioritaet-${String(a.priority).toLowerCase()}`}>{beschrifte(AUFGABENPRIORITAET, a.priority)}</span> : null}
          <span className={zuSpaet ? "ueberfaellig-text" : undefined}>{faellig ? `fällig ${tag(a.due_at!)}` : "ohne Datum"}{zuSpaet ? " · überfällig" : ""}</span>
          <TaskModal task={{ ...a, version: a.version ?? 1 } as any} responsibleName={name(a.responsible_user)} contextLabel={kontextName} canWrite={darfSchreiben} ziel="/api/aufgaben" zurueck={zurueck} />
        </div>
      </div>
    );
  };

  return (
    <section className="data-card aufgaben-baustein" id="aufgaben">
      <div className="card-head">
        <div>
          <p className="eyebrow">Zu erledigen</p>
          <h2>Offene Aufgaben{aufgaben ? ` · ${laufend.length}` : ""}{ueberfaellig ? <span className="ueberfaellig-text"> · {ueberfaellig} überfällig</span> : null}</h2>
        </div>
        <div className="inline-actions">
          {darfSchreiben && !offen ? <button type="button" className="secondary-button compact" onClick={() => setOffen(true)}>+ Aufgabe</button> : null}
          <Link className="subtle-link" to="/crm/tasks?von=alle">Alle Aufgaben →</Link>
        </div>
      </div>

      {meldung ? <p className={meldung.klasse}>{meldung.text}</p> : null}

      {offen ? (
        <Form method="post" action="/api/aufgaben" className="aufgaben-neu" id="aufgabe-neu">
          <input type="hidden" name="_intent" value="anlegen" />
          <input type="hidden" name="zurueck" value={zurueck} />
          <input type="hidden" name="kontext_art" value={art} />
          <input type="hidden" name="kontext_id" value={id} />
          {doppelt ? <>
            <input type="hidden" name="trotzdem" value="1" />
            <p className="form-warning aufgaben-neu-titel">Es gibt an diesem Vorgang schon eine offene Aufgabe mit diesem Titel: <strong>{doppelt.nr}</strong>{doppelt.wer ? ` (verantwortlich: ${doppelt.wer})` : ""}. Soll sie trotzdem ein zweites Mal angelegt werden? Damit zwei Personen dieselbe Aufgabe sehen, genügt eine Aufgabe mit einem Beobachter (Aufgabe öffnen).</p>
          </> : null}
          <label className="form-field aufgaben-neu-titel"><span>Was ist zu tun? *</span><input name="titel" required maxLength={300} defaultValue={doppelt?.titel || vorschlagTitel || ""} autoFocus /></label>
          <label className="form-field"><span>Fällig am *</span><input name="faellig" type="date" required defaultValue={doppelt?.faellig || (vorschlagFaellig && vorschlagFaellig > heute ? vorschlagFaellig : heute)} /></label>
          <label className="form-field"><span>Uhrzeit</span><input name="uhrzeit" type="time" defaultValue={doppelt?.uhrzeit || "09:00"} /></label>
          <label className="form-field"><span>Priorität</span>
            <select name="prioritaet" defaultValue={doppelt?.prioritaet || "NORMAL"}>{Object.entries(AUFGABENPRIORITAET).map(([w, l]) => <option key={w} value={w}>{l}</option>)}</select>
          </label>
          <label className="form-field"><span>Verantwortlich</span>
            <select name="verantwortlich" defaultValue={doppelt?.verantwortlich || verantwortlich || ich}>{nutzer.map((n) => <option key={n.user_id} value={n.user_id}>{n.display_name}</option>)}</select>
          </label>
          <label className="form-field aufgaben-neu-titel"><span>Beschreibung</span><textarea name="beschreibung" rows={2} defaultValue={doppelt?.beschreibung ?? ""} /></label>
          <div className="form-actions aufgaben-neu-titel">
            <button type="button" className="secondary-button" onClick={() => { setOffen(false); if (doppelt) navigate(zurueck, { replace: true, preventScrollReset: true }); }}>Abbrechen</button>
            <button type="submit" className="primary-button">{doppelt ? "Trotzdem anlegen" : "Aufgabe anlegen"}</button>
          </div>
        </Form>
      ) : null}

      {aufgaben === null ? <p className="empty-state">Die Aufgaben konnten gerade nicht geladen werden.</p>
        : laufend.length === 0 ? <p className="empty-state">Keine offene Aufgabe.</p>
        : <div className="data-list">{laufend.map((a) => zeile(a, true))}</div>}

      {fertig.length ? (
        <details className="aufgaben-erledigte">
          <summary>{fertig.length} erledigt oder abgebrochen</summary>
          <div className="data-list">{fertig.map((a) => zeile(a, false))}</div>
        </details>
      ) : null}
    </section>
  );
}
