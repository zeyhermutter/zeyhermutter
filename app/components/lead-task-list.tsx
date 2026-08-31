import { useState } from "react";

type LeadTask = {
  id: string;
  task_number: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  due_at: string | null;
  responsible_user: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value));
}

export function LeadTaskList({ tasks, profileMap }: { tasks: LeadTask[]; profileMap: Record<string, string> }) {
  const [selected, setSelected] = useState<LeadTask | null>(null);

  return (
    <>
      <div className="lead-task-list">
        {tasks.map((task) => (
          <button
            className="lead-task-item"
            key={task.id}
            type="button"
            onClick={() => setSelected(task)}
            title={task.description || "Aufgabe öffnen"}
          >
            <div><strong>{task.title}</strong><small>{task.task_number} · {task.status} · {formatDate(task.due_at)}</small></div>
            <span>Details →</span>
          </button>
        ))}
        {tasks.length === 0 ? <p className="empty-state">Keine Lead-Aufgaben.</p> : null}
      </div>

      {selected ? (
        <div className="lead-modal-backdrop" role="presentation" onMouseDown={() => setSelected(null)}>
          <section className="lead-modal" role="dialog" aria-modal="true" aria-labelledby="lead-task-title" onMouseDown={(event) => event.stopPropagation()}>
            <div className="card-head">
              <div><p className="eyebrow">{selected.task_number} · {selected.priority}</p><h2 id="lead-task-title">{selected.title}</h2></div>
              <button className="text-button" type="button" onClick={() => setSelected(null)}>Schließen ×</button>
            </div>
            <div className="lead-task-modal-meta">
              <span>Status: <strong>{selected.status}</strong></span>
              <span>Fällig: <strong>{formatDate(selected.due_at)}</strong></span>
              <span>Verantwortlich: <strong>{selected.responsible_user ? (profileMap[selected.responsible_user] ?? "Benutzer") : "—"}</strong></span>
            </div>
            <div className="lead-task-description">
              <p className="eyebrow">Beschreibung</p>
              <p>{selected.description || "Für diese Aufgabe wurde noch keine Beschreibung hinterlegt."}</p>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
