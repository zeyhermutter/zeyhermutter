import { Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/reports";
import { requireActiveUser } from "~/lib/auth.server";
import "~/reporting.css";

type PipelineRow = { status: string; count: number };
type DashboardSummary = {
  scope: "mine" | "company";
  from: string;
  to: string;
  generated_at: string;
  snapshot: {
    open_tasks: number;
    overdue_tasks: number;
    active_leads: number;
    overdue_lead_followups: number;
    active_properties: number;
    marketing_properties: number;
    active_search_profiles: number;
    open_inquiries: number;
    upcoming_viewings: number;
    active_offers: number;
    active_closings: number;
    due_commissions: number;
    unpaid_commission_amount: number | string;
    live_marketing_channels: number;
  };
  period: {
    leads_created: number;
    leads_won: number;
    inquiries_received: number;
    viewings_completed: number;
    offers_submitted: number;
    offers_accepted: number;
    closings_completed: number;
    sale_volume: number | string;
    commission_expected: number | string;
    commission_paid: number | string;
  };
  pipeline: {
    leads: PipelineRow[];
    properties: PipelineRow[];
    offers: PipelineRow[];
    closings: PipelineRow[];
    commissions: PipelineRow[];
  };
};

const LEAD_STATUS: Record<string, string> = {
  NEW: "Neu", CONTACTED: "Kontaktiert", QUALIFIED: "Qualifiziert", APPOINTMENT: "Termin",
  VALUATION: "Bewertung", OFFER: "Angebot", WON: "Gewonnen", LOST: "Verloren", NURTURE: "Wiedervorlage",
};
const PROPERTY_STATUS: Record<string, string> = {
  DRAFT: "Entwurf", ACQUISITION: "Akquise", VALUATION: "Bewertung", CONTRACT_PENDING: "Auftrag offen",
  PREPARATION: "Vorbereitung", MARKETING: "Vermarktung", RESERVED: "Reserviert", NOTARY: "Notar",
  SOLD: "Verkauft", LOST: "Verloren", WITHDRAWN: "Zurückgezogen", ARCHIVED: "Archiviert",
};
const OFFER_STATUS: Record<string, string> = {
  DRAFT: "Entwurf", SUBMITTED: "Abgegeben", COUNTERED: "Gegenangebot", ACCEPTED: "Angenommen",
  REJECTED: "Abgelehnt", WITHDRAWN: "Zurückgezogen", REPLACED: "Ersetzt", FAILED: "Gescheitert",
};
const CLOSING_STATUS: Record<string, string> = {
  PREPARATION: "Vorbereitung", NOTARY_INSTRUCTED: "Notar beauftragt", DRAFT_RECEIVED: "Entwurf erhalten",
  APPOINTMENT_SCHEDULED: "Termin vereinbart", NOTARIZED: "Beurkundet", PURCHASE_PRICE_DUE: "Kaufpreis fällig",
  PURCHASE_PRICE_PAID: "Kaufpreis bezahlt", HANDOVER_COMPLETED: "Übergabe erfolgt", COMPLETED: "Abgeschlossen", CANCELLED: "Abgebrochen",
};
const COMMISSION_STATUS: Record<string, string> = {
  DRAFT: "Entwurf", EXPECTED: "Erwartet", DUE: "Fällig", INVOICED: "Abgerechnet",
  PARTIALLY_PAID: "Teilbezahlt", PAID: "Bezahlt", CANCELLED: "Storniert",
};

function berlinToday() {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function validDate(value: string | null, fallback: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return fallback;
  const parsed = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(parsed) ? fallback : value;
}

function formatCurrency(value: number | string | null | undefined) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

function formatGenerated(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value));
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const today = berlinToday();
  const monthStart = `${today.slice(0, 7)}-01`;
  const from = validDate(url.searchParams.get("from"), monthStart);
  const to = validDate(url.searchParams.get("to"), today);
  const requestedScope = url.searchParams.get("scope") === "company" ? "company" : "mine";

  const { data: companyAllowed, error: permissionError } = await supabase.rpc("current_user_has_permission", { p_permission: "reporting.company.read" });
  if (permissionError) throw new Response("Reporting-Berechtigung konnte nicht geprüft werden.", { status: 500, headers: responseHeaders() });
  if (requestedScope === "company" && companyAllowed !== true) throw new Response("Keine Berechtigung für die Unternehmensauswertung.", { status: 403, headers: responseHeaders() });

  const { data: summary, error } = await supabase.rpc("crm_dashboard_summary", { p_scope: requestedScope, p_from: from, p_to: to });
  if (error || !summary) throw new Response("Dashboard-Kennzahlen konnten nicht geladen werden.", { status: 500, headers: responseHeaders() });

  return {
    profile,
    canReadCompany: companyAllowed === true,
    scope: requestedScope,
    from,
    to,
    summary: summary as DashboardSummary,
  };
}

function Metric({ label, value, note, to }: { label: string; value: string | number; note?: string; to?: string }) {
  const body = <><span>{label}</span><strong>{value}</strong>{note ? <small>{note}</small> : null}</>;
  return to ? <Link className="reporting-metric reporting-metric-link" to={to}>{body}</Link> : <article className="reporting-metric">{body}</article>;
}

function Pipeline({ title, rows, labels, to }: { title: string; rows: PipelineRow[]; labels: Record<string, string>; to: string }) {
  const maximum = Math.max(1, ...rows.map((row) => Number(row.count) || 0));
  return <section className="reporting-pipeline">
    <div className="reporting-pipeline-head"><h3>{title}</h3><Link className="subtle-link" to={to}>Öffnen →</Link></div>
    <div className="reporting-pipeline-rows">
      {rows.length === 0 ? <p className="empty-state">Noch keine Daten vorhanden.</p> : rows.map((row) => {
        const count = Number(row.count) || 0;
        return <div className="reporting-pipeline-row" key={row.status}>
          <div className="reporting-pipeline-label"><span>{labels[row.status] ?? row.status}</span><strong>{formatNumber(count)}</strong></div>
          <div className="reporting-pipeline-track" aria-hidden="true"><span style={{ width: `${Math.max(4, (count / maximum) * 100)}%` }} /></div>
        </div>;
      })}
    </div>
  </section>;
}

export default function Reports() {
  const { profile, canReadCompany, scope, from, to, summary } = useLoaderData<typeof loader>();
  const snapshot = summary.snapshot;
  const period = summary.period;
  const query = `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`;

  return <main className="reporting-shell">
    <header className="reporting-header">
      <div>
        <p className="eyebrow">Arbeitsplatz · Kennzahlen</p>
        <h1>Dashboard & Auswertung</h1>
        <p>{scope === "company" ? "Unternehmensweite Sicht" : `Persönlicher Arbeitsplatz · ${profile.display_name}`}</p>
      </div>
      <span className="badge">{__APP_ENV_LABEL__}</span>
    </header>

    <section className="reporting-toolbar data-card">
      <div className="reporting-scope-switch" aria-label="Auswertungsebene">
        <Link className={scope === "mine" ? "primary-button link-button" : "secondary-button link-button"} to={`/reports?scope=mine&${query}`}>Mein Arbeitsplatz</Link>
        {canReadCompany ? <Link className={scope === "company" ? "primary-button link-button" : "secondary-button link-button"} to={`/reports?scope=company&${query}`}>Unternehmen</Link> : null}
      </div>
      <Form method="get" className="reporting-period-form">
        <input type="hidden" name="scope" value={scope}/>
        <label><span>Von</span><input type="date" name="from" defaultValue={from}/></label>
        <label><span>Bis</span><input type="date" name="to" defaultValue={to}/></label>
        <button className="secondary-button" type="submit">Zeitraum anwenden</button>
      </Form>
    </section>

    <section className="reporting-section">
      <div className="reporting-section-head"><div><p className="eyebrow">Heute</p><h2>Operativer Bestand</h2></div><small>Stand {formatGenerated(summary.generated_at)}</small></div>
      <div className="reporting-metric-grid">
        <Metric label="Offene Aufgaben" value={formatNumber(snapshot.open_tasks)} note={`${formatNumber(snapshot.overdue_tasks)} überfällig`} to="/crm/tasks"/>
        <Metric label="Aktive Verkäufer-Leads" value={formatNumber(snapshot.active_leads)} note={`${formatNumber(snapshot.overdue_lead_followups)} Wiedervorlagen überfällig`} to="/leads"/>
        <Metric label="Aktive Immobilien" value={formatNumber(snapshot.active_properties)} note={`${formatNumber(snapshot.marketing_properties)} in Vermarktung / reserviert`} to="/properties"/>
        <Metric label="Aktive Suchprofile" value={formatNumber(snapshot.active_search_profiles)} to="/search-profiles"/>
        <Metric label="Offene Anfragen" value={formatNumber(snapshot.open_inquiries)} to="/inquiries"/>
        <Metric label="Anstehende Besichtigungen" value={formatNumber(snapshot.upcoming_viewings)} to="/viewings"/>
        <Metric label="Aktive Kaufangebote" value={formatNumber(snapshot.active_offers)} to="/purchase-offers"/>
        <Metric label="Laufende Abschlüsse" value={formatNumber(snapshot.active_closings)} to="/closings"/>
        <Metric label="Fällige Provisionen" value={formatNumber(snapshot.due_commissions)} note={`${formatCurrency(snapshot.unpaid_commission_amount)} offen`} to="/commissions"/>
        <Metric label="Live-Vermarktungskanäle" value={formatNumber(snapshot.live_marketing_channels)} note="über die Objektakten geführt" to="/properties"/>
      </div>
    </section>

    <section className="reporting-section">
      <div className="reporting-section-head"><div><p className="eyebrow">Zeitraum {from} bis {to}</p><h2>Leistung & Abschluss</h2></div><small>Aus bestehenden Geschäftsdaten, keine Hochrechnung</small></div>
      <div className="reporting-metric-grid reporting-period-grid">
        <Metric label="Neue Verkäufer-Leads" value={formatNumber(period.leads_created)} note={`${formatNumber(period.leads_won)} gewonnen`} to="/leads"/>
        <Metric label="Eingegangene Anfragen" value={formatNumber(period.inquiries_received)} to="/inquiries"/>
        <Metric label="Durchgeführte Besichtigungen" value={formatNumber(period.viewings_completed)} to="/viewings"/>
        <Metric label="Abgegebene Kaufangebote" value={formatNumber(period.offers_submitted)} note={`${formatNumber(period.offers_accepted)} angenommen`} to="/purchase-offers"/>
        <Metric label="Abgeschlossene Verkäufe" value={formatNumber(period.closings_completed)} note={`Volumen ${formatCurrency(period.sale_volume)}`} to="/closings"/>
        <Metric label="Provision erfasst" value={formatCurrency(period.commission_expected)} note={`${formatCurrency(period.commission_paid)} bezahlt`} to="/commissions"/>
      </div>
    </section>

    <section className="reporting-section">
      <div className="reporting-section-head"><div><p className="eyebrow">Pipeline</p><h2>Verteilung nach Geschäftsstatus</h2></div><small>Aktueller Datenbestand der gewählten Sicht</small></div>
      <div className="reporting-pipeline-grid">
        <Pipeline title="Verkäufer-Leads" rows={summary.pipeline.leads ?? []} labels={LEAD_STATUS} to="/leads"/>
        <Pipeline title="Immobilien" rows={summary.pipeline.properties ?? []} labels={PROPERTY_STATUS} to="/properties"/>
        <Pipeline title="Kaufangebote" rows={summary.pipeline.offers ?? []} labels={OFFER_STATUS} to="/purchase-offers"/>
        <Pipeline title="Abschlüsse & Notar" rows={summary.pipeline.closings ?? []} labels={CLOSING_STATUS} to="/closings"/>
        <Pipeline title="Provisionen" rows={summary.pipeline.commissions ?? []} labels={COMMISSION_STATUS} to="/commissions"/>
      </div>
    </section>

    <section className="data-card reporting-definition">
      <div><p className="eyebrow">Definition</p><h2>Was diese Zahlen bedeuten</h2></div>
      <p>„Mein Arbeitsplatz“ berücksichtigt Datensätze, für die du als verantwortliche Person hinterlegt bist. Die Unternehmenssicht ist separat berechtigt. Geldbeträge stammen ausschließlich aus abgeschlossenen Verkäufen und dem Provisionsmodul; fehlende Werte werden nicht geschätzt. Der gewählte Zeitraum ist auf höchstens 367 Tage begrenzt.</p>
    </section>
  </main>;
}
