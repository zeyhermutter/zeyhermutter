import { Form, Link, useLocation } from "react-router";
import "~/persistent-navigation.css";

type NavItem = { label: string; to: string; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  {
    label: "Arbeitsplatz",
    items: [
      { label: "Übersicht", to: "/crm", exact: true },
      { label: "Suche", to: "/crm/search" },
      { label: "Aufgaben", to: "/crm/tasks" },
    ],
  },
  {
    label: "Objekte & Verkauf",
    items: [
      { label: "Immobilien", to: "/properties" },
      { label: "Verkäufer-Leads", to: "/leads" },
      { label: "Verkaufsstrategie-Check", to: "/crm/sales-readiness" },
    ],
  },
  {
    label: "Interessenten",
    items: [
      { label: "Suchprofile", to: "/search-profiles" },
      { label: "Anfragen", to: "/inquiries" },
      { label: "Besichtigungen", to: "/viewings" },
    ],
  },
  {
    label: "Verwaltung",
    items: [
      { label: "Organisationen", to: "/crm/organizations" },
      { label: "Archiv", to: "/crm/archive" },
      { label: "Systemhistorie", to: "/crm/history" },
    ],
  },
];

function isSalesReadinessDetail(pathname: string) {
  return /^\/leads\/[^/]+\/sales-readiness(?:\/|$)/.test(pathname);
}

function isActive(pathname: string, item: NavItem) {
  const readinessDetail = isSalesReadinessDetail(pathname);

  if (item.to === "/crm/sales-readiness") {
    return pathname === item.to || pathname.startsWith(`${item.to}/`) || readinessDetail;
  }

  if (item.to === "/leads" && readinessDetail) {
    return false;
  }

  if (item.exact) return pathname === item.to;
  return pathname === item.to || pathname.startsWith(`${item.to}/`);
}

function NavGroups({ pathname, mobile = false }: { pathname: string; mobile?: boolean }) {
  return (
    <nav className={mobile ? "persistent-nav-groups mobile" : "persistent-nav-groups"} aria-label={mobile ? "Hauptnavigation mobil" : "Hauptnavigation"}>
      {GROUPS.map((group) => (
        <section className="persistent-nav-group" key={group.label}>
          <span className="persistent-nav-label">{group.label}</span>
          <div className="persistent-nav-links">
            {group.items.map((item) => (
              <Link className={`persistent-nav-item${isActive(pathname, item) ? " active" : ""}`} to={item.to} key={item.to}>
                {item.label}
              </Link>
            ))}
          </div>
        </section>
      ))}
    </nav>
  );
}

export function PersistentNavigation() {
  const location = useLocation();
  const pathname = location.pathname;
  const notificationsActive = pathname === "/crm/notifications";

  return (
    <aside className="persistent-sidebar" aria-label="ZeyherMutterOS Navigation">
      <div className="persistent-nav-top">
        <Link className="persistent-brand" to="/crm" aria-label="Zur CRM-Übersicht">
          <span className="brand-mark">ZM</span>
          <span>ZeyherMutterOS</span>
        </Link>
        <Link className={`persistent-nav-bell${notificationsActive ? " active" : ""}`} to="/crm/notifications" aria-label="Benachrichtigungen" title="Benachrichtigungen">
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
        </Link>
        <details className="persistent-mobile-menu">
          <summary>Menü</summary>
          <div className="persistent-mobile-panel">
            <NavGroups pathname={pathname} mobile />
            <Link className={`persistent-nav-item${notificationsActive ? " active" : ""}`} to="/crm/notifications">Benachrichtigungen</Link>
            <Form method="post" action="/logout"><button className="persistent-logout" type="submit">Abmelden</button></Form>
          </div>
        </details>
      </div>

      <NavGroups pathname={pathname} />

      <div className="persistent-nav-footer">
        <span className="persistent-env">{__APP_ENV_LABEL__}</span>
        <Form method="post" action="/logout"><button className="persistent-logout" type="submit">Abmelden</button></Form>
      </div>
    </aside>
  );
}

export function isInternalAppPath(pathname: string) {
  return pathname === "/crm" || pathname.startsWith("/crm/") || pathname === "/properties" || pathname.startsWith("/properties/") || pathname === "/leads" || pathname.startsWith("/leads/") || pathname === "/search-profiles" || pathname.startsWith("/search-profiles/") || pathname === "/inquiries" || pathname.startsWith("/inquiries/") || pathname === "/viewings" || pathname.startsWith("/viewings/");
}
