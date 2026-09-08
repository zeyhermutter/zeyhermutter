import { Form, Link, useLocation } from "react-router";
import { NotificationBell, type HeaderNotification } from "~/components/notification-bell";
import "~/persistent-navigation.css";

type NavItem = { label: string; to: string; exact?: boolean };
type NavGroup = { label: string; items: NavItem[] };

const GROUPS: NavGroup[] = [
  { label: "Arbeitsplatz", items: [
    { label: "Übersicht", to: "/crm", exact: true }, { label: "Dashboard & Auswertung", to: "/reports" }, { label: "Suche", to: "/crm/search" }, { label: "Aufgaben", to: "/crm/tasks" }, { label: "E-Mail", to: "/crm/email" }, { label: "Kalender", to: "/crm/calendar" },
  ]},
  // Die Reihenfolge folgt dem Ablauf eines Vorgangs, mit einer bewussten
  // Ausnahme: "Immobilien" steht oben in der Verkaufsgruppe, obwohl das Objekt
  // erst nach dem Auftrag entsteht. Es ist der Eintrag, der am haeufigsten
  // angeklickt wird; ihn mitten in eine Zehnerliste zu setzen wuerde die
  // Navigation jeden Tag ein Stueck langsamer machen.
  //
  // "Objekte & Verkauf" hatte zehn Eintraege in einer Gruppe. Ab etwa sieben
  // liest man eine solche Liste nicht mehr, man sucht darin. Deshalb zwei
  // kurze Gruppen: was zum Auftrag fuehrt, und was danach kommt.
  { label: "Akquise", items: [
    { label: "Kampagnen & Gebiete", to: "/acquisition" }, { label: "Verkäufer-Leads", to: "/leads" }, { label: "Verkaufsstrategie-Check", to: "/crm/sales-readiness" },
  ]},
  { label: "Verkauf", items: [
    { label: "Immobilien", to: "/properties" }, { label: "Verkaufsprojekte", to: "/projects" }, { label: "Makleraufträge", to: "/mandates" }, { label: "Kaufangebote", to: "/purchase-offers" }, { label: "Reservierungen", to: "/reservations" }, { label: "Abschlüsse & Notar", to: "/closings" }, { label: "Provisionen", to: "/commissions" },
  ]},
  // Kaeuferseite in der Reihenfolge, in der sie entsteht: die Anfrage kommt
  // herein, daraus wird ein Suchprofil, daraus eine Besichtigung.
  { label: "Interessenten", items: [ { label: "Anfragen", to: "/inquiries" }, { label: "Suchprofile", to: "/search-profiles" }, { label: "Besichtigungen", to: "/viewings" } ]},
  { label: "Nach dem Verkauf", items: [ { label: "Nachbetreuung", to: "/after-sales" }, { label: "Empfehlungen", to: "/referrals" }, { label: "Case Studies", to: "/case-studies" } ]},
  { label: "Verwaltung", items: [ { label: "Website-CMS", to: "/crm/website" }, { label: "Geldwäsche & Aufbewahrung", to: "/compliance" }, { label: "Organisationen", to: "/crm/organizations" }, { label: "Benutzer & Rollen", to: "/crm/users" }, { label: "Weiterbildung", to: "/crm/training" }, { label: "Archiv", to: "/crm/archive" }, { label: "Systemhistorie", to: "/crm/history" }, { label: "Anleitung", to: "/crm/hilfe" } ]},
];

function isSalesReadinessDetail(pathname: string) { return /^\/leads\/[^/]+\/sales-readiness(?:\/|$)/.test(pathname); }
function contextualEmailTarget(pathname: string) { const contactMatch=pathname.match(/^\/crm\/contacts\/([0-9a-f-]{36})(?:\/|$)/i);if(contactMatch)return `/crm/email?contact_id=${encodeURIComponent(contactMatch[1])}`;const leadMatch=pathname.match(/^\/leads\/([0-9a-f-]{36})(?:\/|$)/i);if(leadMatch)return `/crm/email?lead_id=${encodeURIComponent(leadMatch[1])}`;const inquiryMatch=pathname.match(/^\/inquiries\/([0-9a-f-]{36})(?:\/|$)/i);if(inquiryMatch)return `/crm/email?inquiry_id=${encodeURIComponent(inquiryMatch[1])}`;return "/crm/email"; }
function isActive(pathname:string,item:NavItem){const readinessDetail=isSalesReadinessDetail(pathname);if(item.to==="/crm/sales-readiness")return pathname===item.to||pathname.startsWith(`${item.to}/`)||readinessDetail;if(item.to==="/leads"&&readinessDetail)return false;if(item.exact)return pathname===item.to;return pathname===item.to||pathname.startsWith(`${item.to}/`);}
function NavGroups({pathname,mobile=false}:{pathname:string;mobile?:boolean}){return <nav className={mobile?"persistent-nav-groups mobile":"persistent-nav-groups"} aria-label={mobile?"Hauptnavigation mobil":"Hauptnavigation"}>{GROUPS.map(group=><section className="persistent-nav-group" key={group.label}><span className="persistent-nav-label">{group.label}</span><div className="persistent-nav-links">{group.items.map(item=>{const target=item.to==="/crm/email"?contextualEmailTarget(pathname):item.to;return <Link className={`persistent-nav-item${isActive(pathname,item)?" active":""}`} to={target} key={item.to}>{item.label}</Link>;})}</div></section>)}</nav>}
// Die Glocke steht genau einmal, hier im Seitenstreifen. Vorher gab es zwei:
// diese als reinen Link ohne Zaehler und zusaetzlich die Glocke mit Zaehler und
// Klappliste im Kopf der CRM-Uebersicht — auf der Uebersicht standen dadurch
// zwei Glocken nebeneinander, auf allen anderen Seiten eine ohne Zaehler.
// Die Daten kommen jetzt aus routes/internal-layout.tsx und gelten damit
// ueberall. Laesst sich die Liste nicht laden, bleibt der einfache Link — dann
// fehlt der Zaehler, aber die Glocke fuehrt weiterhin zur Uebersicht.
export function PersistentNavigation({notifications,unreadCount}:{notifications?:HeaderNotification[];unreadCount?:number}={}){const location=useLocation(),pathname=location.pathname,notificationsActive=pathname==="/crm/notifications";return <aside className="persistent-sidebar" aria-label="ZeyherMutterOS Navigation"><div className="persistent-nav-top"><Link className="persistent-brand" to="/crm" aria-label="Zur CRM-Übersicht"><span className="brand-mark">ZM</span><span>ZeyherMutterOS</span></Link>{notifications?<NotificationBell notifications={notifications} unreadCount={unreadCount??0}/>:<Link className={`persistent-nav-bell${notificationsActive?" active":""}`} to="/crm/notifications" aria-label="Benachrichtigungen" title="Benachrichtigungen"><svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg></Link>}<details className="persistent-mobile-menu"><summary>Menü</summary><div className="persistent-mobile-panel"><NavGroups pathname={pathname} mobile/><Link className={`persistent-nav-item${notificationsActive?" active":""}`} to="/crm/notifications">Benachrichtigungen</Link><Form method="post" action="/logout"><button className="persistent-logout" type="submit">Abmelden</button></Form></div></details></div><NavGroups pathname={pathname}/><div className="persistent-nav-footer"><span className="persistent-env">{__APP_ENV_LABEL__}</span><Form method="post" action="/logout"><button className="persistent-logout" type="submit">Abmelden</button></Form></div></aside>}
export function isInternalAppPath(pathname:string){return pathname==="/crm"||pathname.startsWith("/crm/")||pathname==="/reports"||pathname.startsWith("/reports/")||pathname==="/properties"||pathname.startsWith("/properties/")||pathname==="/leads"||pathname.startsWith("/leads/")||pathname==="/projects"||pathname.startsWith("/projects/")||pathname==="/acquisition"||pathname.startsWith("/acquisition/")||pathname==="/mandates"||pathname.startsWith("/mandates/")||pathname==="/reservations"||pathname.startsWith("/reservations/")||pathname==="/compliance"||pathname.startsWith("/compliance/")||pathname==="/commissions"||pathname.startsWith("/commissions/")||pathname==="/purchase-offers"||pathname.startsWith("/purchase-offers/")||pathname==="/closings"||pathname.startsWith("/closings/")||pathname==="/search-profiles"||pathname.startsWith("/search-profiles/")||pathname==="/inquiries"||pathname.startsWith("/inquiries/")||pathname==="/viewings"||pathname.startsWith("/viewings/")||pathname==="/case-studies"||pathname.startsWith("/case-studies/")||pathname==="/referrals"||pathname.startsWith("/referrals/")||pathname==="/after-sales"||pathname.startsWith("/after-sales/");}
