import { data, Form, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/reports";
import { requireActiveUser } from "~/lib/auth.server";
import "~/reporting.css";

type PipelineRow = { status: string; count: number };
type LeadSourceRow = {
  source_key: string;
  source_label: string;
  leads: number;
  converted: number;
  conversion_rate: number | string | null;
};
type PeriodPreset = "current_month" | "last_month" | "quarter" | "year" | "custom";
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
    leads_converted: number;
    lead_conversion_rate: number | string | null;
    inquiries_received: number;
    viewings_completed: number;
    viewings_with_offer: number;
    viewing_offer_rate: number | string | null;
    offers_submitted: number;
    offers_accepted: number;
    closings_completed: number;
    sale_volume: number | string;
    commission_expected: number | string;
    commission_paid: number | string;
    avg_marketing_days: number | string | null;
    marketing_duration_sample: number;
  };
  pipeline: {
    leads: PipelineRow[];
    properties: PipelineRow[];
    offers: PipelineRow[];
    closings: PipelineRow[];
    commissions: PipelineRow[];
  };
  breakdowns: {
    lead_sources: LeadSourceRow[];
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
const PERIOD_PRESETS: { key: Exclude<PeriodPreset, "custom">; label: string }[] = [
  { key: "current_month", label: "Aktueller Monat" },
  { key: "last_month", label: "Letzter Monat" },
  { key: "quarter", label: "Quartal" },
  { key: "year", label: "Jahr" },
];

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

function isoDate(year: number, month: number, day: number) {
  return new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10);
}

function parseDate(value: string) {
  const [year, month, day] = value.split("-").map(Number);
  return { year, month, day };
}

function presetRange(preset: Exclude<PeriodPreset, "custom">, today: string) {
  const { year, month } = parseDate(today);
  if (preset === "current_month") return { from: isoDate(year, month, 1), to: today };
  if (preset === "quarter") {
    const quarterStart = Math.floor((month - 1) / 3) * 3 + 1;
    return { from: isoDate(year, quarterStart, 1), to: today };
  }
  if (preset === "year") return { from: isoDate(year, 1, 1), to: today };

  const firstCurrent = new Date(Date.UTC(year, month - 1, 1));
  const firstPrevious = new Date(Date.UTC(year, month - 2, 1));
  const lastPrevious = new Date(firstCurrent.getTime() - 86_400_000);
  return {
    from: firstPrevious.toISOString().slice(0, 10),
    to: lastPrevious.toISOString().slice(0, 10),
  };
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function resolvePeriod(url: URL) {
  const today = berlinToday();
  const requested = url.searchParams.get("period");
  const preset: PeriodPreset = requested === "last_month" || requested === "quarter" || requested === "year" || requested === "custom"
    ? requested
    : "current_month";

  if (preset !== "custom") return { preset, ...presetRange(preset, today), rangeError: null as string | null };

  const defaultRange = presetRange("current_month", today);
  const from = validDate(url.searchParams.get("from"), defaultRange.from);
  const to = validDate(url.searchParams.get("to"), defaultRange.to);
  if (from > to) return { preset, ...defaultRange, rangeError: "Der Start des Zeitraums muss vor dem Ende liegen." };
  if (daysBetween(from, to) > 366) return { preset, ...defaultRange, rangeError: "Der frei definierte Zeitraum darf höchstens 367 Kalendertage umfassen." };
  return { preset, from, to, rangeError: null as string | null };
}

function formatCurrency(value: number | string | null | undefined) {
  return new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

function formatNumber(value: number | string | null | undefined) {
  return new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 }).format(Number(value ?? 0));
}

function formatRate(value: number | string | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(Number(value))} %`;
}

function formatDays(value: number | string | null | undefined) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return null;
  return `${new Intl.NumberFormat("de-DE", { maximumFractionDigits: 1 }).format(Number(value))} Tage`;
}

function formatGenerated(value: string) {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(value));
}

function formatDate(value: string) {
  const { year, month, day } = parseDate(value);
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

function reportUrl(scope: "mine" | "company", preset: PeriodPreset, from?: string, to?: string) {
  const params = new URLSearchParams({ scope, period: preset });
  if (preset === "custom" && from && to) {
    params.set("from", from);
    params.set("to", to);
  }
  return `/reports?${params.toString()}`;
}

export async function loader({ request, context }: Route.LoaderArgs) {
  const { supabase, responseHeaders, profile } = await requireActiveUser(request, context.cloudflare.env);
  const url = new URL(request.url);
  const requestedScope = url.searchParams.get("scope") === "company" ? "company" : "mine";
  const period = resolvePeriod(url);

  const { data: companyAllowed, error: permissionError } = await supabase.rpc("current_user_has_permission", { p_permission: "reporting.company.read" });
  if (permissionError) throw new Response("Reporting-Berechtigung konnte nicht geprüft werden.", { status: 500, headers: responseHeaders() });
  if (requestedScope === "company" && companyAllowed !== true) throw new Response("Keine Berechtigung für die Unternehmensauswertung.", { status: 403, headers: responseHeaders() });

  const { data: summary, error } = await supabase.rpc("crm_management_dashboard_summary", {
    p_scope: requestedScope,
    p_from: period.from,
    p_to: period.to,
  });
  if (error || !summary) throw new Response("Dashboard-Kennzahlen konnten nicht geladen werden.", { status: 500, headers: responseHeaders() });

  return data({
    profile,
    canReadCompany: companyAllowed === true,
    scope: requestedScope,
    periodPreset: period.preset,
    from: period.from,
    to: period.to,
    rangeError: period.rangeError,
    summary: summary as DashboardSummary,
  }, { headers: responseHeaders() });
}

function Metric({ label, value, note, to, unavailableNote }: { label: string; value: string | number | null; note?: string; to?: string; unavailableNote?: string }) {
  const unavailable = value === null;
  const body = <>
    <span>{label}</span>
    <strong className={unavailable ? "reporting-metric-unavailable" : undefined}>{unavailable ? "Noch nicht verfügbar" : value}</strong>
    {unavailable ? <small>{unavailableNote}</small> : note ? <small>{note}</small> : null}
  </>;
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

function LeadSources({ rows }: { rows: LeadSourceRow[] }) {
  const maximum = Math.max(1, ...rows.map((row) => Number(row.leads) || 0));
  return <div className="reporting-source-list">
    {rows.length === 0 ? <p className="empty-state">Im gewählten Zeitraum wurden keine Verkäufer-Leads angelegt.</p> : rows.map((row) => {
      const leads = Number(row.leads) || 0;
      const converted = Number(row.converted) || 0;
      return <article className="reporting-source-row" key={`${row.source_key}-${row.source_label}`}>
        <div className="reporting-source-head"><strong>{row.source_label}</strong><span>{formatNumber(leads)} Leads</span></div>
        <div className="reporting-source-track" aria-hidden="true"><span style={{ width: `${Math.max(4, (leads / maximum) * 100)}%` }} /></div>
        <small>{formatNumber(converted)} in Immobilie überführt · Conversion {formatRate(row.conversion_rate) ?? "nicht verfügbar"}</small>
      </article>;
    })}
  </div>;
}

export default function Reports() {
  const { profile, canReadCompany, scope, periodPreset, from, to, rangeError, summary } = useLoaderData<typeof loader>();
  const snapshot = summary.snapshot;
  const period = summary.period;
  const leadSources = summary.breakdowns?.lead_sources ?? [];
  const unassignedLeads = leadSources.find((row) => row.source_key === "UNASSIGNED")?.leads ?? 0;
  const leadConversion = formatRate(period.lead_conversion_rate);
  const viewingOfferConversion = formatRate(period.viewing_offer_rate);
  const marketingDays = formatDays(period.avg_marketing_days);

  return <main className="reporting-shell">
    <header className="reporting-header">
      <div>
        <p className="eyebrow">Arbeitsplatz · Management</p>
        <h1>Reporting & Controlling</h1>
        <p>{scope === "company" ? "Unternehmensweite Maklersteuerung" : `Persönliche Auswertung · ${profile.display_name}`}</p>
      </div>
      <span className="badge">{__APP_ENV_LABEL__}</span>
    </header>

    <section className="reporting-toolbar data-card">
      <div className="reporting-control-group">
        <span className="reporting-control-label">Auswertungsebene</span>
        <div className="reporting-scope-switch" aria-label="Auswertungsebene">
          <Link className={scope === "mine" ? "primary-button link-button" : "secondary-button link-button"} to={reportUrl("mine", periodPreset, from, to)}>Mein Arbeitsplatz</Link>
          {canReadCompany ? <Link className={scope === "company" ? "primary-button link-button" : "secondary-button link-button"} to={reportUrl("company", periodPreset, from, to)}>Unternehmen</Link> : null}
        </div>
      </div>

      <div className="reporting-control-group reporting-period-control">
        <span className="reporting-control-label">Schnellzeitraum</span>
        <div className="reporting-period-presets">
          {PERIOD_PRESETS.map((preset) => <Link
            className={`reporting-preset${periodPreset === preset.key ? " active" : ""}`}
            to={reportUrl(scope, preset.key)}
            key={preset.key}
          >{preset.label}</Link>)}
          <span className={`reporting-preset reporting-preset-static${periodPreset === "custom" ? " active" : ""}`}>Freier Zeitraum</span>
        </div>
      </div>

      <div className="reporting-control-group">
        <span className="reporting-control-label">Freier Zeitraum</span>
        <Form method="get" className="reporting-period-form">
          <input type="hidden" name="scope" value={scope}/>
          <input type="hidden" name="period" value="custom"/>
          <label><span>Von</span><input type="date" name="from" defaultValue={from}/></label>
          <label><span>Bis</span><input type="date" name="to" defaultValue={to}/></label>
          <button className="secondary-button" type="submit">Anwenden</button>
        </Form>
        {rangeError ? <p className="reporting-range-error">{rangeError}</p> : null}
      </div>
    </section>

    <section className="reporting-section data-card">
      <div className="reporting-section-head"><div><p className="eyebrow">Stand heute</p><h2>Operative Steuerung</h2></div><small>Aktualisiert {formatGenerated(summary.generated_at)}</small></div>
      <div className="reporting-metric-grid">
        <Metric label="Offene Aufgaben" value={formatNumber(snapshot.open_tasks)} note={`${formatNumber(snapshot.overdue_tasks)} überfällig`} to="/crm/tasks"/>
        <Metric label="Aktive Verkäufer-Leads" value={formatNumber(snapshot.active_leads)} note={`${formatNumber(snapshot.overdue_lead_followups)} Wiedervorlagen überfällig`} to="/leads"/>
        <Metric label="Aktive Immobilien" value={formatNumber(snapshot.active_properties)} note={`${formatNumber(snapshot.marketing_properties)} in Vermarktung / reserviert`} to="/properties"/>
        <Metric label="Offene Anfragen" value={formatNumber(snapshot.open_inquiries)} to="/inquiries"/>
        <Metric label="Anstehende Besichtigungen" value={formatNumber(snapshot.upcoming_viewings)} to="/viewings"/>
        <Metric label="Aktive Kaufangebote" value={formatNumber(snapshot.active_offers)} to="/purchase-offers"/>
        <Metric label="Laufende Abschlüsse" value={formatNumber(snapshot.active_closings)} to="/closings"/>
        <Metric label="Fällige Provisionen" value={formatNumber(snapshot.due_commissions)} note={`${formatCurrency(snapshot.unpaid_commission_amount)} offen`} to="/commissions"/>
        <Metric label="Aktive Suchprofile" value={formatNumber(snapshot.active_search_profiles)} to="/search-profiles"/>
        <Metric label="Live-Vermarktungskanäle" value={formatNumber(snapshot.live_marketing_channels)} note="über die Objektakten geführt" to="/properties"/>
      </div>
    </section>

    <section className="reporting-section data-card">
      <div className="reporting-section-head">
        <div><p className="eyebrow">{formatDate(from)} bis {formatDate(to)}</p><h2>Akquise, Funnel & Abschluss</h2></div>
        <small>Nur tatsächlich vorhandene Geschäftsdaten · keine Hochrechnung</small>
      </div>
      <div className="reporting-metric-grid reporting-period-grid">
        <Metric label="Neue Verkäufer-Leads" value={formatNumber(period.leads_created)} note={`${formatNumber(period.leads_converted)} in Immobilie überführt`} to="/leads"/>
        <Metric label="Lead-Conversion" value={leadConversion} note={`${formatNumber(period.leads_converted)} von ${formatNumber(period.leads_created)} Leads`} unavailableNote="Im Zeitraum wurden keine neuen Verkäufer-Leads angelegt."/>
        <Metric label="Eingegangene Anfragen" value={formatNumber(period.inquiries_received)} to="/inquiries"/>
        <Metric label="Durchgeführte Besichtigungen" value={formatNumber(period.viewings_completed)} to="/viewings"/>
        <Metric label="Besichtigung → Angebot" value={viewingOfferConversion} note={`${formatNumber(period.viewings_with_offer)} von ${formatNumber(period.viewings_completed)} Besichtigungen`} unavailableNote="Im Zeitraum gibt es keine abgeschlossenen Besichtigungen als Datenbasis."/>
        <Metric label="Abgegebene Kaufangebote" value={formatNumber(period.offers_submitted)} to="/purchase-offers"/>
        <Metric label="Verkäufe" value={formatNumber(period.closings_completed)} note={`Verkaufsvolumen ${formatCurrency(period.sale_volume)}`} to="/closings"/>
        <Metric label="Ø Vermarktungsdauer" value={marketingDays} note={`Basis: ${formatNumber(period.marketing_duration_sample)} beurkundete Verkäufe`} unavailableNote="Noch kein Verkauf im Zeitraum mit dokumentiertem Live-Start und Beurkundungsdatum."/>
        <Metric label="Erwartete Provision" value={formatCurrency(period.commission_expected)} note="im Zeitraum erfasste, nicht stornierte Provision" to="/commissions"/>
        <Metric label="Realisierte Provision" value={formatCurrency(period.commission_paid)} note="nach dokumentiertem Zahlungseingang" to="/commissions"/>
      </div>
    </section>

    <section className="reporting-section data-card">
      <div className="reporting-section-head">
        <div><p className="eyebrow">Akquise</p><h2>Verkäufer-Leads nach Quelle</h2></div>
        <small>Quelle der im gewählten Zeitraum neu angelegten Leads</small>
      </div>
      <LeadSources rows={leadSources}/>
      {Number(unassignedLeads) > 0 ? <p className="reporting-quality-note"><strong>Datenhinweis:</strong> {formatNumber(unassignedLeads)} Leads im Zeitraum besitzen noch keine strukturierte Leadquelle.</p> : null}
    </section>

    <section className="reporting-section data-card">
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
      <div><p className="eyebrow">Nachvollziehbarkeit</p><h2>Definitionen & Datenbasis</h2></div>
      <ul>
        <li><strong>Lead-Conversion:</strong> Anteil der im gewählten Zeitraum neu angelegten Verkäufer-Leads, die bis zum Ende dieses Zeitraums über das dokumentierte Feld <code>converted_at</code> in eine Immobilie überführt wurden.</li>
        <li><strong>Besichtigung → Angebot:</strong> Anteil der im Zeitraum abgeschlossenen Besichtigungen, für die bis zum Periodenende ein abgegebenes Kaufangebot mit direkter <code>viewing_id</code>-Verknüpfung existiert.</li>
        <li><strong>Ø Vermarktungsdauer:</strong> Tage vom frühesten dokumentierten <code>live_at</code> eines Vermarktungskanals bis zum Beurkundungsdatum. Ohne vollständiges Datenpaar wird nicht geschätzt.</li>
        <li><strong>Provision:</strong> Erwartete Provision basiert auf im Zeitraum erfassten, nicht stornierten Provisionsdatensätzen; realisierte Provision ausschließlich auf dokumentierten Zahlungen mit <code>paid_at</code> im Zeitraum.</li>
        <li><strong>Mein Arbeitsplatz:</strong> berücksichtigt die jeweils hinterlegte verantwortliche Person. Die Unternehmenssicht ist separat über <code>reporting.company.read</code> berechtigt.</li>
      </ul>
    </section>
  </main>;
}
