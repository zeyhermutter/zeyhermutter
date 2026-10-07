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
import { PropertyContextNavigation } from "~/components/property-context-navigation";
import { objektakteAusPfad } from "~/lib/objektakte-navigation";
import { ViewingDetailEnhancements } from "~/components/viewing-detail-enhancements";
import { ViewingReplanModal } from "~/components/viewing-replan-modal";
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
  if (!claims?.claims?.sub) return { notifications: null, unreadCount: 0, immobilienStatus: null };

  const [{ count, error: countError }, { data: rows, error: rowError }] = await Promise.all([
    supabase.from("notifications").select("id", { count: "exact", head: true }).is("read_at", null),
    supabase.from("notifications").select("id,type,title,message,entity_type,entity_id,created_at,read_at").order("created_at", { ascending: false }).limit(8),
  ]);
  if (countError || rowError) return { notifications: null, unreadCount: 0, immobilienStatus: null };

  // Der Status der Immobilie, aber nur auf einer Objektakte. Die Leiste
  // darueber faltet danach; ohne Status faltet sie nicht, und das ist die
  // richtige Vorgabe -- lieber eine volle Leiste als eine, die den gesuchten
  // Abschnitt grundlos wegraeumt.
  //
  // Eine Abfrage auf den Primaerschluessel, und nur auf Objektseiten. Faellt
  // sie aus, bleibt der Status null; die Leiste zeigt dann alles.
  const akte = objektakteAusPfad(new URL(request.url).pathname);
  let immobilienStatus: string | null = null;
  if (akte) {
    const { data: immobilie } = await supabase
      .from("properties").select("status").eq("id", akte.propertyId).maybeSingle();
    immobilienStatus = (immobilie?.status as string | undefined) ?? null;
  }

  return {
    notifications: (rows ?? []) as HeaderNotification[],
    unreadCount: count ?? 0,
    immobilienStatus,
  };
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

export default function InternalLayout({ loaderData }: Route.ComponentProps) {
  return (
    <div className="persistent-app-frame">
      <CrmFormGuardrails />
      <SmartBackNavigation />
      <ViewingDetailEnhancements />
      <ViewingReplanModal />
      <SalesReadinessLeadEntryEnhancer />
      <PersistentNavigation notifications={loaderData?.notifications ?? undefined} unreadCount={loaderData?.unreadCount ?? 0} />
      <div className="persistent-app-main">
        <LiveListFilters />
        <PropertyContextNavigation immobilienStatus={loaderData?.immobilienStatus ?? null} />
        <RecordSectionNavigation />
        <HelpEntry />
        <Outlet />
      </div>
    </div>
  );
}
