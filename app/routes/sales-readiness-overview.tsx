import { data, Link, useLoaderData } from "react-router";
import type { Route } from "./+types/sales-readiness-overview";
import { Aufklapper } from "~/components/aufklapper";
import { requirePermission } from "~/lib/auth.server";
import { requireSalesReadinessBackend } from "~/lib/sales-readiness.server";
import { tag as formatDate } from "~/lib/format";
import { CHECKSTATUS as CHECK_STATUS, LEADSTATUS, beschrifte } from "~/lib/labels";
import { OWNER_DECISION_LABELS } from "~/lib/sales-readiness";
// Die Entscheidung des Eigentuemers wird in app/lib/sales-readiness.ts gefuehrt.
// Diese Seite hatte dafuer eine eigene Tabelle mit vier Werten (OPEN, ACCEPTED,
// PARTIALLY_ACCEPTED, DECLINED). Die Spalte kennt aber sieben andere; drei der
// vier Schluessel trafen nie, und ab der ersten echten Entscheidung haette hier
// AS_IS_SALE gestanden.
const OWNER_DECISION: Record<string, string> = OWNER_DECISION_LABELS;
import "~/lead.css";
import "~/programm-liste.css";

import { ListenUeberschrift } from "~/components/listen-ueberschrift";
const CHECK_STATUS_CLASS: Record<string, string> = {
  DRAFT: "status-draft",
  READY_FOR_REVIEW: "status-marketing",
  FINALIZED: "status-sold",
};

function one(value: any) {
  return Array.isArray(value) ? value[0] : value;
}

export function meta() {
  return [
    { title: "Verkaufsstrategie-Checks · ZeyherMutterOS" },
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
    throw new Response("Verkaufsstrategie-Checks konnten nicht geladen werden.", { status: 500 });
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
  const { leads, checkByLead, summary } = useLoaderData<typeof loader>();

  // Programmliste (13.10.2026) wie Makleraufträge: Werkzeugleiste, eine
  // Zeile Kennzahlen, Tabelle mit Spaltenkoepfen.
  return (
    <main className="editor-shell programm-liste"><ListenUeberschrift/>
      <div className="programm-liste-werkzeuge">
        <Aufklapper knopf="Worum geht es beim Verkaufsstrategie-Check?">
          <p className="programm-erklaerung">
            Der Check ist Teil der Verkäufer-Akte. Ausgangslage, drei Verkaufsszenarien,
            Maßnahmen und Eigentümerentscheidung werden strukturiert vorbereitet und anschließend direkt
            mit dem Lead weitergeführt.
          </p>
        </Aufklapper>
        <span className="programm-liste-zaehler">{summary.started} von {summary.total} gestartet</span>
        <Link className="secondary-button link-button" to="/leads">Verkäufer-Leads</Link>
      </div>

      <p className="programm-kennzahlen">
        <span><strong>{summary.total}</strong> aktive Verkäufer-Leads</span>
        <span><strong>{summary.drafts}</strong> Entwürfe</span>
        <span><strong>{summary.ready}</strong> prüfbereit</span>
        <span><strong>{summary.finalized}</strong> finalisiert</span>
      </p>

      <div className="programm-tabelle-rahmen">
        {leads.length === 0 ? <p className="programm-liste-leer">Keine aktiven Verkäufer-Leads vorhanden.</p> : (
          <table className="programm-tabelle">
            <thead><tr><th>Lead</th><th>Eigentümer</th><th>Ort</th><th>Check</th><th>Entscheidung</th><th>Lead-Status</th><th className="rechts">Zuletzt</th></tr></thead>
            <tbody>
              {leads.map((lead: any) => {
                const contact = one(lead.contacts);
                const check = checkByLead[lead.id];
                const date = check?.finalized_at ?? check?.updated_at ?? lead.updated_at;
                const pfad = `/leads/${lead.id}/sales-readiness`;
                return (
                  <tr key={lead.id}>
                    <td className="zahl"><Link to={pfad}>{lead.lead_number}</Link></td>
                    <td><Link to={pfad}>{contact ? `${contact.first_name} ${contact.last_name}` : "—"}</Link></td>
                    <td>{lead.property_city ?? <span className="leise">—</span>}</td>
                    <td>
                      <span className={`status-pill ${check ? CHECK_STATUS_CLASS[check.status] ?? "status-draft" : "status-archived"}`}>
                        {check ? CHECK_STATUS[check.status] ?? check.status : "Nicht gestartet"}
                      </span>
                      <div className="leise">{check ? `Revision ${check.revision_no}` : "Entwurf anlegen"}</div>
                    </td>
                    <td>{check ? OWNER_DECISION[check.owner_decision] ?? check.owner_decision ?? "offen" : <span className="leise">noch kein Check</span>}</td>
                    <td>{beschrifte(LEADSTATUS, lead.status)}</td>
                    <td className="zahl rechts">{formatDate(date)}<div className="leise">{check?.finalized_at ? "finalisiert" : check ? "bearbeitet" : "Lead"}</div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}
