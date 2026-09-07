import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import type { Route } from "./+types/internal-layout";
import type { HeaderNotification } from "~/components/notification-bell";
import { createSupabaseServerClient } from "~/lib/supabase.server";
import { CrmFormGuardrails } from "~/components/crm-form-guardrails";
import { HelpEntry } from "~/components/help-entry";
import { LiveListFilters } from "~/components/live-list-filters";
import { PersistentNavigation } from "~/components/persistent-navigation";
import { RecordSectionNavigation } from "~/components/record-section-navigation";
import "~/crm-form-guardrails.css";
import "~/responsive-data-card.css";
import "~/crm-light-theme.css";
import "~/crm-light-theme-fixes.css";
// Der Hilfe-Knopf und sein Fenster stehen auf JEDER internen Seite. Sein
// Stylesheet gehoert deshalb hierher und nicht in routes/help.tsx: von dort
// geladen fehlte es ueberall ausser auf der Anleitungsseite selbst, und der
// Knopf stand ungestylt im Textfluss statt fest unten rechts.
import "~/help.css";

const NAV_STACK_KEY = "zm_internal_navigation_stack";

// Die Benachrichtigungen fuer die Glocke im Seitenstreifen. Sie lagen bisher
// nur im Loader der CRM-Uebersicht, weshalb die Glocke auf allen anderen Seiten
// keinen Zaehler hatte. Hier gilt sie fuer jede interne Seite.
//
// Der Loader wirft bewusst nicht: er haengt an jeder internen Seite, und eine
// nicht ladbare Glocke darf keine Akte unerreichbar machen. Faellt die Abfrage
// aus, liefert er null; der Seitenstreifen zeigt dann den einfachen Link ohne
// Zaehler. Die Anmeldung selbst pruefen weiterhin die einzelnen Seiten.
export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase } = createSupabaseServerClient(request, context.cloudflare.env);
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims?.sub) return { notifications: null, unreadCount: 0 };

  const [{ count, error: countError }, { data: rows, error: rowError }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.from("notifications").select("id,type,title,message,entity_type,entity_id,created_at,read_at").order("created_at", { ascending: false }).limit(8),
  ]);
  if (countError || rowError) return { notifications: null, unreadCount: 0 };

  return { notifications: (rows ?? []) as HeaderNotification[], unreadCount: count ?? 0 };
}

function readStack() {
  try {
    const value = JSON.parse(sessionStorage.getItem(NAV_STACK_KEY) || "[]");
    return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.startsWith("/")).slice(-50) : [];
  } catch {
    return [] as string[];
  }
}

function SmartBackNavigation() {
  const location = useLocation();
  const navigate = useNavigate();
  const current = `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    const stack = readStack();
    if (stack.at(-1) !== current) {
      stack.push(current);
      sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(stack.slice(-50)));
    }
  }, [current]);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const element = event.target instanceof Element ? event.target.closest("a.back-link") : null;
      if (!(element instanceof HTMLAnchorElement)) return;

      const stack = readStack();
      if (stack.at(-1) === current) stack.pop();
      const previous = stack.at(-1);
      if (!previous || previous === current) return;

      event.preventDefault();
      sessionStorage.setItem(NAV_STACK_KEY, JSON.stringify(stack));
      navigate(previous);
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [current, navigate]);

  return null;
}

function SalesReadinessLeadEntryEnhancer() {
  const location = useLocation();

  useEffect(() => {
    if (!/^\/leads\/[^/]+\/?$/.test(location.pathname)) return;

    const state = document.querySelector<HTMLElement>(".lead-readiness-state");
    const link = document.querySelector<HTMLAnchorElement>('.lead-readiness-entry a[href$="/sales-readiness"]');
    if (!state && !link) return;

    const previousState = state?.textContent ?? "";
    const previousLink = link?.textContent ?? "";

    if (state) state.textContent = "Aktiver Workflow · vollständig mit Supabase verbunden";
    if (link) link.textContent = "Verkaufsstrategie-Check öffnen →";

    return () => {
      if (state) state.textContent = previousState;
      if (link) link.textContent = previousLink;
    };
  }, [location.key, location.pathname]);

  return null;
}

function PropertyContextNavigation() {
  const location = useLocation();
  const match = location.pathname.match(/^\/properties\/([^/]+)(?:\/(documents|document-requirements|media|interests|publication|exposes|marketing|compliance|legal|disposition|pricing|hoa-tenancy|mandatory-data)(?:\/.*)?)?\/?$/);
  if (!match) return null;

  const propertyId = match[1];
  const section = match[2] ?? "record";
  return (
    <nav className="property-context-nav persistent-property-context-nav" aria-label="Immobilienakte">
      <Link className={section === "record" ? "active" : ""} to={`/properties/${propertyId}`}>Objektakte</Link>
      <Link className={section === "legal" ? "active" : ""} to={`/properties/${propertyId}/legal`}>Recht & Lasten</Link>
      <Link className={section === "disposition" ? "active" : ""} to={`/properties/${propertyId}/disposition`}>Verfügungsberechtigung</Link>
      <Link className={section === "pricing" ? "active" : ""} to={`/properties/${propertyId}/pricing`}>Preis & Wert</Link>
      <Link className={section === "hoa-tenancy" ? "active" : ""} to={`/properties/${propertyId}/hoa-tenancy`}>WEG & Miete</Link>
      <Link className={section === "mandatory-data" ? "active" : ""} to={`/properties/${propertyId}/mandatory-data`}>Pflichtangaben</Link>
      <Link className={section === "interests" ? "active" : ""} to={`/properties/${propertyId}/interests`}>Interessenten & Besichtigungen</Link>
      <Link className={section === "publication" ? "active" : ""} to={`/properties/${propertyId}/publication`}>Website</Link>
      <Link className={section === "exposes" ? "active" : ""} to={`/properties/${propertyId}/exposes`}>Exposés</Link>
      <Link className={section === "marketing" ? "active" : ""} to={`/properties/${propertyId}/marketing`}>Vermarktung & Portale</Link>
      <Link className={section === "documents" ? "active" : ""} to={`/properties/${propertyId}/documents`}>Dokumente</Link>
      <Link className={section === "document-requirements" ? "active" : ""} to={`/properties/${propertyId}/document-requirements`}>Unterlagenliste</Link>
      <Link className={section === "media" ? "active" : ""} to={`/properties/${propertyId}/media`}>Medien</Link>
      <Link className={section === "compliance" ? "active" : ""} to={`/properties/${propertyId}/compliance`}>Geldwäsche</Link>
      <Link to={`/mandates?property_id=${encodeURIComponent(propertyId)}`}>Maklerauftrag</Link>
      <Link to={`/purchase-offers?property_id=${encodeURIComponent(propertyId)}`}>Kaufangebote</Link>
      <Link to={`/reservations?property_id=${encodeURIComponent(propertyId)}`}>Reservierungen</Link>
      <Link to={`/closings?property_id=${encodeURIComponent(propertyId)}`}>Abschluss & Notar</Link>
      <Link to={`/commissions?property_id=${encodeURIComponent(propertyId)}`}>Provisionen</Link>
    </nav>
  );
}

export default function InternalLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="persistent-app-frame">
      <CrmFormGuardrails />
      <SmartBackNavigation />
      <SalesReadinessLeadEntryEnhancer />
      <PersistentNavigation notifications={loaderData?.notifications ?? undefined} unreadCount={loaderData?.unreadCount ?? 0} />
      <div className="persistent-app-main">
        <LiveListFilters />
        <PropertyContextNavigation />
        <RecordSectionNavigation />
        <HelpEntry />
        <Outlet />
      </div>
    </div>
  );
}
