import { Link } from "react-router";
import { tag } from "~/lib/format";
import { AUFGABENPRIORITAET, AUFGABENSTATUS, beschrifte } from "~/lib/labels";
import "~/programm-liste.css";

// Offene Aufgaben in der Objektakte (14.10.2026).
//
// Aufgaben zur Immobilie entstanden an vielen Stellen -- Unterlagenliste,
// Verfuegungsberechtigung, Mein Tag verlinkte auf das Objekt --, aber die
// Akte selbst zeigte keine. Wer dem Link aus "Liegen geblieben" folgte, fand
// die Aufgabe nicht.

type Aufgabe = { id: string; task_number: string; title: string; status: string; priority: string; due_at: string | null; responsible_user: string | null };

export function ObjektAufgaben({ aufgaben, nutzer }: {
  aufgaben: Aufgabe[] | null;
  nutzer: { user_id: string; display_name: string }[];
}) {
  const heute = new Date().toISOString().slice(0, 10);
  const name = (id: string | null) => nutzer.find((n) => n.user_id === id)?.display_name ?? "—";
  return (
    <section className="data-card" id="aufgaben">
      <div className="card-head">
        <div><p className="eyebrow">Zu erledigen</p><h2>Offene Aufgaben{aufgaben ? ` · ${aufgaben.length}` : ""}</h2></div>
        <Link className="subtle-link" to="/crm/tasks?von=alle">Alle Aufgaben →</Link>
      </div>
      {aufgaben === null ? <p className="empty-state">Die Aufgaben konnten gerade nicht geladen werden.</p>
        : aufgaben.length === 0 ? <p className="empty-state">Keine offene Aufgabe zu diesem Objekt.</p>
        : <div className="data-list">{aufgaben.map((a) => {
          const faellig = a.due_at ? a.due_at.slice(0, 10) : null;
          const ueberfaellig = faellig !== null && faellig < heute;
          return <div className="data-row" key={a.id}>
            <div>
              <strong>{a.title}</strong>
              <small>{a.task_number} · {beschrifte(AUFGABENSTATUS, a.status)} · {name(a.responsible_user)}</small>
            </div>
            <div className="row-meta">
              <span className={`prioritaet prioritaet-${String(a.priority).toLowerCase()}`}>{beschrifte(AUFGABENPRIORITAET, a.priority)}</span>
              <span className={ueberfaellig ? "ueberfaellig-text" : undefined}>{faellig ? `fällig ${tag(a.due_at!)}` : "ohne Datum"}{ueberfaellig ? " · überfällig" : ""}</span>
            </div>
          </div>;
        })}</div>}
    </section>
  );
}
