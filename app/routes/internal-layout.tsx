import { useEffect } from "react";
import { Link, Outlet, useLocation, useNavigate } from "react-router";
import { CrmFormGuardrails } from "~/components/crm-form-guardrails";
import { LiveListFilters } from "~/components/live-list-filters";
import { PersistentNavigation } from "~/components/persistent-navigation";
import { RecordSectionNavigation } from "~/components/record-section-navigation";
import "~/crm-form-guardrails.css";
import "~/responsive-data-card.css";
import "~/crm-light-theme.css";
import "~/crm-light-theme-fixes.css";

const NAV_STACK_KEY = "zm_internal_navigation_stack";

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
  const match = location.pathname.match(/^\/properties\/([^/]+)(?:\/(documents|media|interests|publication|exposes|marketing|compliance)(?:\/.*)?)?\/?$/);
  if (!match) return null;

  const propertyId = match[1];
  const section = match[2] ?? "record";
  return (
    <nav className="property-context-nav persistent-property-context-nav" aria-label="Immobilienakte">
      <Link className={section === "record" ? "active" : ""} to={`/properties/${propertyId}`}>Objektakte</Link>
      <Link className={section === "interests" ? "active" : ""} to={`/properties/${propertyId}/interests`}>Interessenten & Besichtigungen</Link>
      <Link className={section === "publication" ? "active" : ""} to={`/properties/${propertyId}/publication`}>Website</Link>
      <Link className={section === "exposes" ? "active" : ""} to={`/properties/${propertyId}/exposes`}>Exposés</Link>
      <Link className={section === "marketing" ? "active" : ""} to={`/properties/${propertyId}/marketing`}>Vermarktung & Portale</Link>
      <Link className={section === "documents" ? "active" : ""} to={`/properties/${propertyId}/documents`}>Dokumente</Link>
      <Link className={section === "compliance" ? "active" : ""} to={`/properties/${propertyId}/compliance`}>Geldwäsche</Link>
      <Link className={section === "media" ? "active" : ""} to={`/properties/${propertyId}/media`}>Medien</Link>
      <Link to={`/mandates?property_id=${encodeURIComponent(propertyId)}`}>Maklerauftrag</Link>
      <Link to={`/purchase-offers?property_id=${encodeURIComponent(propertyId)}`}>Kaufangebote</Link>
      <Link to={`/closings?property_id=${encodeURIComponent(propertyId)}`}>Abschluss & Notar</Link>
      <Link to={`/commissions?property_id=${encodeURIComponent(propertyId)}`}>Provisionen</Link>
    </nav>
  );
}

export default function InternalLayout() {
  return (
    <div className="persistent-app-frame">
      <CrmFormGuardrails />
      <SmartBackNavigation />
      <SalesReadinessLeadEntryEnhancer />
      <PersistentNavigation />
      <div className="persistent-app-main">
        <LiveListFilters />
        <PropertyContextNavigation />
        <RecordSectionNavigation />
        <Outlet />
      </div>
    </div>
  );
}
