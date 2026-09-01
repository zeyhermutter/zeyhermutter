import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/sales-readiness-overview";
import { requirePermission } from "~/lib/auth.server";
import { requireSalesReadinessBackend } from "~/lib/sales-readiness.server";

const CHECK_STATUS: Record<string, string> = {
  DRAFT: "Entwurf",
  READY_FOR_REVIEW: "Prüfbereit",
  FINALIZED: "Finalisiert",
};

const OWNER_DECISION: Record<string, string> = {
  OPEN: "Eigentümerentscheidung offen",
  ACCEPTED: "Empfehlung angenommen",
  PARTIALLY_ACCEPTED: "Teilweise angenommen",
  DECLINED: "Empfehlung abgelehnt",
};

function one(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("de-DE", {
    dateStyle: "medium",
    timeZone: "Europe/Berlin",
  }).format(new Date(value));
}

export function meta() {
  return [
    { title: "Verkaufsfertig-Checks · ZeyherMutterOS" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function loader({ request, context }: Route.LoaderArgs) {
  requireSalesReadinessBackend(context.cloudflare.env);
  const { supabase, responseHeaders } = await requirePermission(
    request,
    context.cloudflare.env,
    "sales_readiness.read",
  );

  const { data: canReadLead } = await supabase.rpc("current_user_has_permission", {
    p_permission: "lead.read",
  });
  if (canReadLead !== true) {
    throw new Response("Keine Berechtigung für Verkäufer-Leads.", {
      status: 403,
      headers: responseHeaders(),
    });
  }

  const [leadResult, checkResult] = await Promise.all([
    supabase
      .from("leads")
      .select("id,lead_number,status,property_city,updated_at,contacts!inner(first_name,last_name)")
      .is("archived_at", null)
      .order("updated_at", { ascending: false })
      .limit(250),
    supabase
      .from("lead_sales_readiness_checks")
      .select("id,lead_id,status,revision_no,is_current,owner_decision,inspection_at,updated_at,finalized_at")
      .eq("is_current", true)
      .order("updated_at", { ascending: false })
      .limit(250),
  ]);

  if (leadResult.error || checkResult.error) {
    throw new Response("Verkaufsfertig-Checks konnten nicht geladen werden.", { status: 500 });
  }

  const leads = leadResult.data ?? [];
  const checks = checkResult.data ?? [];
  const checkByLead = Object.fromEntries(checks.map((check) => [check.lead_id, check]));

  return data(
    {
      leads,
      checkByLead,
      summary: {
        total: leads.length,
        started: checks.length,
        drafts: checks.filter((check) => check.status === "DRAFT").length,
        ready: checks.filter((check) => check.status === "READY_FOR_REVIEW").length,
        finalized: checks.filter((check) => check.status === "FINALIZED").length,
      },
    },
    { headers: responseHeaders() },
  );
}

export default function SalesReadinessOverview() {
  const { leads, checkByLead, summary } = useLoaderData<typeof loader>();

  return (
    <main className="editor-shell">
      <header className="editor-header">
        <div>
          <Link className="back-link" to="/crm">← CRM</Link>
          <p className="eyebrow">Verkäufer · Verkaufsstrategie</p>
          <h1 className="editor-title">Verkaufsfertig-Checks</h1>
          <p className="editor-meta">Aktiver CRM-Workflow von der Objektanalyse bis zur finalisierten Maßnahmenentscheidung.</p>
        </div>
        <div className="header-actions">
          <span className="badge">{summary.started} gestartet</span>
          <Link className="secondary-button link-button" to="/leads">Verkäufer-Leads</Link>
        </div>
      </header>

      <section className="metric-grid">
        <article className="metric-card"><span>Verkäufer-Leads</span><strong>{summary.total}</strong><small>aktive Leads</small></article>
        <article className="metric-card"><span>Entwürfe</span><strong>{summary.drafts}</strong><small>in Bearbeitung</small></article>
        <article className="metric-card"><span>Prüfbereit</span><strong>{summary.ready}</strong><small>zur Entscheidung</small></article>
        <article className="metric-card"><span>Finalisiert</span><strong>{summary.finalized}</strong><small>abgeschlossene aktuelle Revisionen</small></article>
      </section>

      <section className="data-card">
        <div className="card-head">
          <div>
            <p className="eyebrow">Arbeitsliste</p>
            <h2>Verkaufsfertig-Status je Verkäufer-Lead</h2>
          </div>
          <span className="subtle">{summary.started} / {summary.total} gestartet</span>
        </div>
        <div className="data-list">
          {leads.map((lead: any) => {
            const contact = one(lead.contacts);
            const check = checkByLead[lead.id];
            const state = check ? (CHECK_STATUS[check.status] ?? check.status) : "Noch nicht gestartet";
            const detail = check
              ? `Revision ${check.revision_no} · ${OWNER_DECISION[check.owner_decision] ?? check.owner_decision ?? "Eigentümerentscheidung offen"}`
              : "Arbeitsbereich öffnen und Entwurf anlegen";
            const date = check?.finalized_at ?? check?.updated_at ?? lead.updated_at;

            return (
              <Link className="data-row data-row-link" to={`/leads/${lead.id}/sales-readiness`} key={lead.id}>
                <div>
                  <strong>{contact ? `${contact.first_name} ${contact.last_name}` : lead.lead_number}</strong>
                  <small>{lead.lead_number}{lead.property_city ? ` · ${lead.property_city}` : ""} · Lead-Status {lead.status}</small>
                </div>
                <div className="row-meta">
                  <span>{state}</span>
                  <small>{detail} · {formatDate(date)}</small>
                </div>
              </Link>
            );
          })}
          {leads.length === 0 ? <p className="empty-state">Keine aktiven Verkäufer-Leads vorhanden.</p> : null}
        </div>
      </section>
    </main>
  );
}
