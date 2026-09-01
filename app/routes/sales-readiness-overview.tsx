import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/sales-readiness-overview";
import { requirePermission } from "~/lib/auth.server";
import { requireSalesReadinessBackend } from "~/lib/sales-readiness.server";
import "~/lead.css";

const CHECK_STATUS: Record<string, string> = {
  DRAFT: "Entwurf",
  READY_FOR_REVIEW: "Prüfbereit",
  FINALIZED: "Finalisiert",
};

const CHECK_STATUS_CLASS: Record<string, string> = {
  DRAFT: "status-draft",
  READY_FOR_REVIEW: "status-marketing",
  FINALIZED: "status-sold",
};

const OWNER_DECISION: Record<string, string> = {
  OPEN: "Entscheidung offen",
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
  const { supabase, responseHeaders, profile } = await requirePermission(
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
      profile,
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
  const { profile, leads, checkByLead, summary } = useLoaderData<typeof loader>();

  return (
    <main className="editor-shell lead-shell">
      <header className="editor-header">
        <div>
          <Link className="back-link" to="/crm">← CRM</Link>
          <p className="eyebrow">Modul 03 · Eigentümer & Leads</p>
          <h1 className="editor-title">Verkaufsfertig-Checks</h1>
          <p className="editor-meta">Vom ersten Objektbild bis zur abgestimmten Entscheidung für den Marktstart.</p>
        </div>
        <div className="header-user">
          <Link className="secondary-button link-button" to="/leads">Verkäufer-Leads</Link>
          <span className="badge">{__APP_ENV_LABEL__}</span>
          <small>{profile.display_name}</small>
        </div>
      </header>

      <div className="lead-page-width">
        <section className="data-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Verkaufsstrategie</p>
              <h2>Verkaufsfertig vor dem Marktstart</h2>
            </div>
          </div>
          <p className="lead-explainer">
            <strong>Der Check ist Teil der Verkäufer-Akte.</strong> Ausgangslage, drei Verkaufsszenarien,
            Maßnahmen und Eigentümerentscheidung werden strukturiert vorbereitet und anschließend direkt
            mit dem Lead weitergeführt.
          </p>
        </section>

        <section className="metric-grid">
          <article className="metric-card">
            <span>Verkäufer-Leads</span>
            <strong>{summary.total}</strong>
            <small>aktive Leads</small>
          </article>
          <article className="metric-card">
            <span>Entwürfe</span>
            <strong>{summary.drafts}</strong>
            <small>in Bearbeitung</small>
          </article>
          <article className="metric-card">
            <span>Prüfbereit</span>
            <strong>{summary.ready}</strong>
            <small>zur Entscheidung</small>
          </article>
          <article className="metric-card">
            <span>Finalisiert</span>
            <strong>{summary.finalized}</strong>
            <small>aktuelle Revisionen</small>
          </article>
        </section>

        <section className="data-card">
          <div className="card-head">
            <div>
              <p className="eyebrow">Arbeitsliste</p>
              <h2>Verkäufer-Leads & Check-Status</h2>
            </div>
            <span className="subtle">{summary.started} von {summary.total} gestartet</span>
          </div>

          <div className="data-list">
            {leads.map((lead: any) => {
              const contact = one(lead.contacts);
              const check = checkByLead[lead.id];
              const date = check?.finalized_at ?? check?.updated_at ?? lead.updated_at;

              return (
                <Link className="data-row data-row-link lead-list-row" to={`/leads/${lead.id}/sales-readiness`} key={lead.id}>
                  <div>
                    <strong>{contact ? `${contact.first_name} ${contact.last_name}` : lead.lead_number}</strong>
                    <small>{lead.lead_number}{lead.property_city ? ` · ${lead.property_city}` : ""}</small>
                  </div>

                  <div>
                    <span className={`lead-status-pill ${check ? CHECK_STATUS_CLASS[check.status] ?? "status-draft" : "status-archived"}`}>
                      {check ? CHECK_STATUS[check.status] ?? check.status : "Nicht gestartet"}
                    </span>
                    <small>{check ? `Revision ${check.revision_no}` : "Entwurf anlegen"}</small>
                  </div>

                  <div className="lead-row-secondary">
                    <strong>{check ? OWNER_DECISION[check.owner_decision] ?? check.owner_decision ?? "Entscheidung offen" : "Noch kein Check"}</strong>
                    <small>Lead-Status {lead.status}</small>
                  </div>

                  <div className="row-meta lead-row-secondary">
                    <span>{formatDate(date)}</span>
                    <small>{check?.finalized_at ? "finalisiert" : check ? "zuletzt bearbeitet" : "Lead aktualisiert"}</small>
                  </div>

                  <span className="subtle-link">Öffnen →</span>
                </Link>
              );
            })}
            {leads.length === 0 ? <p className="empty-state">Keine aktiven Verkäufer-Leads vorhanden.</p> : null}
          </div>
        </section>
      </div>
    </main>
  );
}
