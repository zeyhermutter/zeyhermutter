import { data, Form, redirect, useLoaderData } from "react-router";
import type { Route } from "./+types/crm";
import { createSupabaseServerClient } from "~/lib/supabase.server";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders } = createSupabaseServerClient(
    request,
    context.cloudflare.env,
  );

  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub as string | undefined;

  if (claimsError || !userId) {
    return redirect("/login", { headers: responseHeaders() });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("user_id, display_name, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (!profile || profile.status !== "ACTIVE") {
    return data(
      {
        accessPending: true,
        profile,
        contacts: [],
        tasks: [],
      },
      { status: 403, headers: responseHeaders() },
    );
  }

  const [{ data: contacts, error: contactError }, { data: tasks, error: taskError }] =
    await Promise.all([
      supabase
        .from("contacts")
        .select("id, contact_number, first_name, last_name, email, mobile, status, updated_at")
        .is("archived_at", null)
        .order("updated_at", { ascending: false })
        .limit(10),
      supabase
        .from("tasks")
        .select("id, task_number, title, status, priority, due_at")
        .is("archived_at", null)
        .in("status", ["OPEN", "IN_PROGRESS"])
        .order("due_at", { ascending: true })
        .limit(10),
    ]);

  if (contactError || taskError) {
    throw new Response("CRM-Daten konnten nicht geladen werden.", { status: 500 });
  }

  return data(
    {
      accessPending: false,
      profile,
      contacts: contacts ?? [],
      tasks: tasks ?? [],
    },
    { headers: responseHeaders() },
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

export default function CrmDashboard() {
  const { accessPending, profile, contacts, tasks } = useLoaderData<typeof loader>();

  if (accessPending) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <p className="eyebrow">ZeyherMutterOS · STAGING</p>
          <h1 className="auth-title">Zugang noch nicht freigeschaltet</h1>
          <p className="auth-copy">
            Das Benutzerkonto ist vorhanden, benötigt aber noch eine aktive Rolle.
          </p>
          <Form method="post" action="/logout">
            <button className="secondary-button" type="submit">Abmelden</button>
          </Form>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">ZM</span>
          <span>ZeyherMutterOS</span>
        </div>
        <nav className="sidebar-nav" aria-label="Hauptnavigation">
          <a className="nav-item active" href="/crm">Dashboard</a>
          <span className="nav-item">CRM</span>
          <span className="nav-item muted">Leads</span>
          <span className="nav-item muted">Immobilien</span>
          <span className="nav-item muted">Besichtigungen</span>
          <span className="nav-item muted">Provisionen</span>
        </nav>
        <div className="sidebar-footer">
          <small>STAGING</small>
          <strong>{profile?.display_name}</strong>
          <Form method="post" action="/logout">
            <button className="text-button" type="submit">Abmelden</button>
          </Form>
        </div>
      </aside>

      <section className="app-content">
        <header className="app-header">
          <div>
            <p className="eyebrow">Phase 1 · CRM</p>
            <h1 className="app-title">Guten Tag, {profile?.display_name}.</h1>
          </div>
          <span className="badge">STAGING</span>
        </header>

        <div className="metric-grid">
          <article className="metric-card"><span>Kontakte</span><strong>{contacts.length}</strong><small>zuletzt aktive Auswahl</small></article>
          <article className="metric-card"><span>Offene Aufgaben</span><strong>{tasks.length}</strong><small>nächste Fälligkeiten</small></article>
          <article className="metric-card"><span>Security</span><strong>RLS</strong><small>serverseitig aktiv</small></article>
        </div>

        <div className="dashboard-grid">
          <section className="data-card">
            <div className="card-head">
              <div><p className="eyebrow">CRM</p><h2>Kontakte</h2></div>
              <span className="subtle">Modul 01</span>
            </div>
            {contacts.length === 0 ? (
              <p className="empty-state">Noch keine Kontakte vorhanden.</p>
            ) : (
              <div className="data-list">
                {contacts.map((contact) => (
                  <div className="data-row" key={contact.id}>
                    <div><strong>{contact.first_name} {contact.last_name}</strong><small>{contact.contact_number}</small></div>
                    <div className="row-meta"><span>{contact.email ?? contact.mobile ?? "—"}</span><small>{formatDate(contact.updated_at)}</small></div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="data-card">
            <div className="card-head">
              <div><p className="eyebrow">Wiedervorlagen</p><h2>Aufgaben</h2></div>
            </div>
            {tasks.length === 0 ? (
              <p className="empty-state">Keine offenen Aufgaben.</p>
            ) : (
              <div className="data-list">
                {tasks.map((task) => (
                  <div className="data-row" key={task.id}>
                    <div><strong>{task.title}</strong><small>{task.task_number} · {task.priority}</small></div>
                    <div className="row-meta"><span>{task.status}</span><small>{formatDate(task.due_at)}</small></div>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
