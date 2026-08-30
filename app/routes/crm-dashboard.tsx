import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/crm-dashboard";
import { PropertyOverviewMap, type PropertyMapPoint } from "~/components/property-overview-map";
import { requireActiveUser } from "~/lib/auth.server";
import "~/property-map.css";

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(request, context.cloudflare.env);

  const [
    { data: contacts, error: contactError },
    { data: tasks, error: taskError },
    { count: contactCount, error: contactCountError },
    { count: organizationCount, error: organizationError },
    { count: taskCount, error: taskCountError },
    { count: unreadCount, error: notificationError },
    { count: propertyCount, error: propertyError },
    propertyPermission,
  ] = await Promise.all([
    supabase.from("contacts").select("id, contact_number, first_name, last_name, email, mobile, status, updated_at").is("archived_at", null).order("updated_at", { ascending: false }).limit(25),
    supabase.from("tasks").select("id, task_number, title, status, priority, due_at, contact_id").is("archived_at", null).in("status", ["OPEN", "IN_PROGRESS"]).order("due_at", { ascending: true }).limit(10),
    supabase.from("contacts").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("organizations").select("id", { count: "exact", head: true }).is("archived_at", null),
    supabase.from("tasks").select("id", { count: "exact", head: true }).is("archived_at", null).in("status", ["OPEN", "IN_PROGRESS"]),
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.from("properties").select("id", { count: "exact", head: true }).neq("status", "ARCHIVED"),
    supabase.rpc("current_user_has_permission", { p_permission: "property.read" }),
  ]);

  if (contactError || taskError || contactCountError || organizationError || taskCountError || notificationError || propertyError) {
    throw new Response("CRM-Daten konnten nicht geladen werden.", { status: 500 });
  }

  let propertyMapPoints: PropertyMapPoint[] = [];
  if (propertyPermission.data === true) {
    const { data: addressRows } = await supabase
      .from("property_addresses")
      .select("property_id, latitude, longitude, street, house_number, postal_code, city, district, properties!inner(id, property_number, internal_title, status, transaction_type)")
      .not("latitude", "is", null)
      .not("longitude", "is", null)
      .neq("properties.status", "ARCHIVED")
      .order("city");

    propertyMapPoints = (addressRows ?? []).flatMap((row: any) => {
      const property = Array.isArray(row.properties) ? row.properties[0] : row.properties;
      const latitude = Number(row.latitude);
      const longitude = Number(row.longitude);
      if (!property || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return [];
      return [{
        id: property.id,
        propertyNumber: property.property_number,
        title: property.internal_title,
        status: property.status,
        transactionType: property.transaction_type,
        latitude,
        longitude,
        addressLabel: `${row.street} ${row.house_number}, ${row.postal_code} ${row.city}${row.district ? ` · ${row.district}` : ""}`,
      } satisfies PropertyMapPoint];
    });
  }

  return data({ profile, contacts: contacts ?? [], tasks: tasks ?? [], contactCount: contactCount ?? 0, organizationCount: organizationCount ?? 0, taskCount: taskCount ?? 0, unreadCount: unreadCount ?? 0, propertyCount: propertyCount ?? 0, propertyMapPoints }, { headers: responseHeaders() });
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value));
}

export default function CrmDashboard() {
  const { profile, contacts, tasks, contactCount, organizationCount, taskCount, unreadCount, propertyCount, propertyMapPoints } = useLoaderData<typeof loader>();

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><span className="brand-mark">ZM</span><span>ZeyherMutterOS</span></div>
        <nav className="sidebar-nav" aria-label="Hauptnavigation">
          <Link className="nav-item active" to="/crm">CRM</Link>
          <Link className="nav-item" to="/crm/search">Suche</Link>
          <Link className="nav-item" to="/crm/tasks">Aufgaben</Link>
          <Link className="nav-item" to="/crm/notifications">Benachrichtigungen{unreadCount > 0 ? ` (${unreadCount})` : ""}</Link>
          <Link className="nav-item" to="/crm/organizations">Organisationen</Link>
          <Link className="nav-item" to="/crm/history">Systemhistorie</Link>
          <Link className="nav-item" to="/crm/archive">Archiv</Link>
          <Link className="nav-item" to="/properties">Immobilien</Link>
          <span className="nav-item muted">Leads</span>
          <span className="nav-item muted">Besichtigungen</span>
          <span className="nav-item muted">Provisionen</span>
        </nav>
        <div className="sidebar-footer"><small>STAGING</small><strong>{profile.display_name}</strong><Form method="post" action="/logout"><button className="text-button" type="submit">Abmelden</button></Form></div>
      </aside>

      <section className="app-content">
        <header className="app-header">
          <div><p className="eyebrow">Phase 1 · CRM</p><h1 className="app-title">Guten Tag, {profile.display_name}.</h1></div>
          <div className="header-actions"><Link className="secondary-button link-button" to="/properties">Immobilien · {propertyCount}</Link><Link className="secondary-button link-button" to="/crm/notifications">Inbox{unreadCount > 0 ? ` · ${unreadCount}` : ""}</Link><Link className="secondary-button link-button" to="/crm/search">Suchen</Link><Link className="primary-button link-button" to="/crm/contacts/new">+ Kontakt</Link><span className="badge">STAGING</span></div>
        </header>

        <div className="metric-grid">
          <article className="metric-card"><span>Kontakte</span><strong>{contactCount}</strong><small>aktive Kontakte</small></article>
          <article className="metric-card"><span>Organisationen</span><strong>{organizationCount}</strong><small>aktive Firmen/Partner</small></article>
          <article className="metric-card"><span>Offene Aufgaben</span><strong>{taskCount}</strong><small>offen / in Bearbeitung</small></article>
        </div>

        <section className="data-card property-map-card">
          <div className="card-head"><div><p className="eyebrow">Immobilien</p><h2>Standorte</h2></div><div><Link className="subtle-link" to="/properties">Alle Immobilien</Link><div className="map-coverage-note">{propertyMapPoints.length} von {propertyCount} lokalisiert</div></div></div>
          <PropertyOverviewMap points={propertyMapPoints} />
        </section>

        <div className="dashboard-grid">
          <section className="data-card">
            <div className="card-head"><div><p className="eyebrow">Kontakte</p><h2>Zuletzt bearbeitet</h2></div><Link className="subtle-link" to="/crm/contacts/new">Neu anlegen</Link></div>
            {contacts.length === 0 ? <p className="empty-state">Noch keine Kontakte vorhanden.</p> : (
              <div className="data-list">
                {contacts.map((contact) => (
                  <div className="data-row" key={contact.id}>
                    <div><strong>{contact.first_name} {contact.last_name}</strong><small>{contact.contact_number} · {contact.email ?? contact.mobile ?? "—"}</small></div>
                    <div className="row-meta"><Link className="subtle-link" to={`/crm/contacts/${contact.id}/relations`}>Arbeitsbereich</Link><Link className="subtle-link" to={`/crm/contacts/${contact.id}/collaboration`}>Aktivität & Team</Link><Link className="subtle-link" to={`/crm/contacts/${contact.id}/associations`}>Firma & Adresse</Link><Link className="subtle-link" to={`/crm/contacts/${contact.id}`}>Stammdaten</Link></div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="data-card">
            <div className="card-head"><div><p className="eyebrow">Wiedervorlagen</p><h2>Nächste Aufgaben</h2></div><Link className="subtle-link" to="/crm/tasks">Alle Aufgaben</Link></div>
            {tasks.length === 0 ? <p className="empty-state">Keine offenen Aufgaben.</p> : (
              <div className="data-list">
                {tasks.map((task) => (
                  <div className="data-row" key={task.id}><div><strong>{task.title}</strong><small>{task.task_number} · {task.priority}</small></div><div className="row-meta"><span>{task.status}</span><small>{formatDate(task.due_at)}</small></div></div>
                ))}
              </div>
            )}
          </section>
        </div>
      </section>
    </main>
  );
}
