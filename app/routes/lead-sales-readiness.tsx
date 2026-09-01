import { data, Link, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/lead-sales-readiness";
import { SalesReadinessWorkspace } from "~/components/sales-readiness-workspace";
import { SalesReadinessAiPanel } from "~/components/sales-readiness-ai-panel";
import { requirePermission } from "~/lib/auth.server";
import { loadSalesReadiness, requireSalesReadinessBackend } from "~/lib/sales-readiness.server";
import "~/sales-readiness.css";
import "~/sales-readiness-editor.css";

type ActionResult = { error?: string; ok?: string };

function text(fd: FormData, key: string) {
  return String(fd.get(key) ?? "").trim();
}

function nullableNumber(value: string) {
  if (!value) return null;
  const normalized = value.includes(",")
    ? value.replace(/\./g, "").replace(",", ".")
    : value;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : NaN;
}

function nullableInteger(value: string) {
  const number = nullableNumber(value);
  if (number === null) return null;
  return Number.isInteger(number) ? number : NaN;
}

function dateOrNull(value: string) {
  return value || null;
}

function inspectionIso(value: string) {
  return value ? `${value}T12:00:00.000Z` : null;
}

function errorMessage(error: any, fallback: string) {
  const message = String(error?.message ?? "");

  if (message.includes("CONFLICT") || message.includes("40001")) {
    return "Der Check wurde inzwischen geändert. Bitte neu laden und die Angaben erneut prüfen.";
  }
  if (message.includes("FINALIZED_SALES_READINESS")) {
    return "Finalisierte Checks sind unveränderlich. Bitte eine Revision anlegen.";
  }
  if (message.includes("COMPLETE_CHECK_BASICS")) {
    return "Für die Prüfbereitschaft fehlen Pflichtangaben: Besichtigung, Ausgangssituation, Verkaufsziel, Gesamtbeurteilung oder Annahmen/Unsicherheiten.";
  }
  if (message.includes("THREE_SCENARIOS_AND_ONE_RECOMMENDATION")) {
    return "Für diesen Schritt werden genau drei Szenarien und genau eine fachliche Empfehlung benötigt.";
  }
  if (message.includes("COMPLETE_SCENARIOS")) {
    return "Alle drei Szenarien benötigen Beschreibung, Annahmen, interne Bewertung, Preis- und Dauerangaben. Bei Aufbereitungsszenarien ist zusätzlich die Investitionsspanne erforderlich; die Empfehlung braucht eine Begründung.";
  }
  if (message.includes("DECIDED_MEASURES")) {
    return "Bitte jede Maßnahme fachlich entscheiden. Eine Maßnahme darf für Prüfbereitschaft oder Finalisierung nicht auf „Offen“ stehen.";
  }
  if (message.includes("OWNER_DECISION_REQUIRES_DECIDER")) {
    return "Bitte dokumentieren, wer die Eigentümerentscheidung getroffen hat.";
  }
  if (message.includes("FINALIZATION_REQUIRES_OWNER_DECISION")) {
    return "Vor der Finalisierung muss die Eigentümerentscheidung dokumentiert werden.";
  }
  if (message.includes("MEASURE_REQUIRES_QUOTE_PRICE")) {
    return "Für den Status „Angebot erhalten“ muss ein Angebotspreis erfasst sein.";
  }
  if (message.includes("MEASURE_REQUIRES_OWNER_APPROVAL")) {
    return "Diese Maßnahme kann erst weitergeführt werden, wenn die Eigentümerfreigabe dokumentiert oder als nicht erforderlich markiert ist.";
  }
  if (message.includes("MEASURE_DECISION_NOT_ACTIONABLE")) {
    return "Empfehlung und Maßnahmenstatus passen fachlich nicht zusammen. Nicht empfohlene oder nicht erforderliche Maßnahmen dürfen nicht beauftragt werden.";
  }
  if (message.includes("MEASURE_TITLE_REQUIRED")) {
    return "Eine Maßnahme benötigt einen Titel.";
  }

  return fallback;
}

export function meta() {
  return [
    { title: "Verkaufsfertig-Check · ZeyherMutterOS" },
    { name: "robots", content: "noindex, nofollow" },
  ];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  requireSalesReadinessBackend(context.cloudflare.env);
  const { supabase, responseHeaders, profile } = await requirePermission(
    request,
    context.cloudflare.env,
    "sales_readiness.read",
  );

  if (!params.leadId) throw new Response("Lead fehlt.", { status: 404 });

  const { data: canReadLead } = await supabase.rpc("current_user_has_permission", {
    p_permission: "lead.read",
  });
  if (canReadLead !== true) {
    throw new Response("Keine Berechtigung für diesen Lead.", {
      status: 403,
      headers: responseHeaders(),
    });
  }

  const [{ data: canWrite }, { data: canFinalize }, { data: canTask }] = await Promise.all([
    supabase.rpc("current_user_has_permission", { p_permission: "sales_readiness.write" }),
    supabase.rpc("current_user_has_permission", { p_permission: "sales_readiness.finalize" }),
    supabase.rpc("current_user_has_permission", { p_permission: "task.write" }),
  ]);

  const viewModel = await loadSalesReadiness(supabase, params.leadId);
  return data(
    {
      viewModel,
      profile,
      canWrite: canWrite === true,
      canFinalize: canFinalize === true,
      canTask: canTask === true,
      aiConfigured:
        context.cloudflare.env.SALES_READINESS_AI_ENABLED === "true" &&
        Boolean(context.cloudflare.env.OPENAI_API_KEY),
    },
    { headers: responseHeaders() },
  );
}

export async function action({ request, context, params }: Route.ActionArgs) {
  requireSalesReadinessBackend(context.cloudflare.env);
  if (!params.leadId) throw new Response("Lead fehlt.", { status: 404 });

  const fd = await request.formData();
  const intent = text(fd, "_intent");
  const permission = intent === "finalize" || intent === "revision"
    ? "sales_readiness.finalize"
    : "sales_readiness.write";
  const { supabase, responseHeaders } = await requirePermission(
    request,
    context.cloudflare.env,
    permission,
  );
  const leadId = params.leadId;

  const { data: canReadLead } = await supabase.rpc("current_user_has_permission", {
    p_permission: "lead.read",
  });
  if (canReadLead !== true) {
    return data<ActionResult>(
      { error: "Keine Berechtigung für diesen Lead." },
      { status: 403, headers: responseHeaders() },
    );
  }

  if (intent === "create") {
    const { error } = await supabase.rpc("create_lead_sales_readiness_draft", {
      p_lead_id: leadId,
    });
    if (error) {
      return data<ActionResult>(
        { error: errorMessage(error, "Entwurf konnte nicht angelegt werden.") },
        { status: 400, headers: responseHeaders() },
      );
    }
    return data<ActionResult>(
      { ok: "Verkaufsfertig-Check angelegt." },
      { headers: responseHeaders() },
    );
  }

  const checkId = text(fd, "check_id");
  const expectedVersion = Number(text(fd, "version"));
  if (!checkId || !Number.isFinite(expectedVersion)) {
    return data<ActionResult>(
      { error: "Ungültiger Check-Kontext." },
      { status: 400, headers: responseHeaders() },
    );
  }

  if (intent === "save_check") {
    const { error } = await supabase.rpc("save_lead_sales_readiness_check", {
      p_lead_id: leadId,
      p_check_id: checkId,
      p_expected_version: expectedVersion,
      p_inspection_at: inspectionIso(text(fd, "inspection_date")),
      p_starting_situation: text(fd, "starting_situation"),
      p_sale_objective: text(fd, "sale_objective"),
      p_desired_timeframe: text(fd, "desired_timeframe"),
      p_overall_assessment: text(fd, "overall_assessment"),
      p_assumptions_and_uncertainties: text(fd, "assumptions_and_uncertainties"),
    });
    if (error) {
      return data<ActionResult>(
        { error: errorMessage(error, "Grunddaten konnten nicht gespeichert werden.") },
        { status: 400, headers: responseHeaders() },
      );
    }
    return data<ActionResult>(
      { ok: "Grunddaten gespeichert. Änderungen an einem prüfbereiten Check setzen ihn wieder auf Entwurf." },
      { headers: responseHeaders() },
    );
  }

  if (intent === "save_scenario") {
    const scenarioId = text(fd, "scenario_id");
    if (!scenarioId) {
      return data<ActionResult>(
        { error: "Szenario fehlt." },
        { status: 400, headers: responseHeaders() },
      );
    }

    const investmentMin = nullableNumber(text(fd, "investment_min"));
    const investmentMax = nullableNumber(text(fd, "investment_max"));
    const priceMin = nullableNumber(text(fd, "estimated_sale_price_min"));
    const priceMax = nullableNumber(text(fd, "estimated_sale_price_max"));
    const durationMin = nullableInteger(text(fd, "duration_weeks_min"));
    const durationMax = nullableInteger(text(fd, "duration_weeks_max"));
    const numbers = [investmentMin, investmentMax, priceMin, priceMax, durationMin, durationMax];

    if (numbers.some((value) => typeof value === "number" && !Number.isFinite(value))) {
      return data<ActionResult>(
        { error: "Bitte nur gültige Zahlen verwenden; Wochen müssen ganze Zahlen sein." },
        { status: 400, headers: responseHeaders() },
      );
    }

    const { error } = await supabase.rpc("save_lead_sales_readiness_scenario", {
      p_check_id: checkId,
      p_scenario_id: scenarioId,
      p_expected_check_version: expectedVersion,
      p_title: text(fd, "title"),
      p_description: text(fd, "description"),
      p_assumptions: text(fd, "assumptions"),
      p_internal_assessment: text(fd, "internal_assessment"),
      p_recommendation_rationale: text(fd, "recommendation_rationale"),
      p_confidence: text(fd, "confidence") || "LOW",
      p_investment_min: investmentMin,
      p_investment_max: investmentMax,
      p_estimated_sale_price_min: priceMin,
      p_estimated_sale_price_max: priceMax,
      p_duration_weeks_min: durationMin,
      p_duration_weeks_max: durationMax,
      p_is_recommended: fd.get("is_recommended") === "on",
    });

    if (error) {
      return data<ActionResult>(
        { error: errorMessage(error, "Szenario konnte nicht gespeichert werden.") },
        { status: 400, headers: responseHeaders() },
      );
    }
    return data<ActionResult>(
      { ok: "Szenario gespeichert. Mehrerlös und wirtschaftlicher Vorteil werden aus den Korridoren neu berechnet." },
      { headers: responseHeaders() },
    );
  }

  if (intent === "owner_decision") {
    const { error } = await supabase.rpc("record_lead_sales_readiness_owner_decision", {
      p_check_id: checkId,
      p_expected_version: expectedVersion,
      p_owner_decision: text(fd, "owner_decision") || "OPEN",
      p_owner_decision_at: dateOrNull(text(fd, "owner_decision_at")),
      p_owner_decision_by: text(fd, "owner_decision_by"),
      p_owner_decision_note: text(fd, "owner_decision_note"),
    });

    if (error) {
      return data<ActionResult>(
        { error: errorMessage(error, "Eigentümerentscheidung konnte nicht gespeichert werden.") },
        { status: 400, headers: responseHeaders() },
      );
    }
    return data<ActionResult>(
      { ok: "Eigentümerentscheidung dokumentiert." },
      { headers: responseHeaders() },
    );
  }

  if (intent === "save_measure") {
    const measureId = text(fd, "measure_id") || null;
    const costMin = nullableNumber(text(fd, "cost_min"));
    const costMax = nullableNumber(text(fd, "cost_max"));
    const quotePrice = nullableNumber(text(fd, "quote_price"));
    const approvedBudget = nullableNumber(text(fd, "approved_budget"));
    const actualCost = nullableNumber(text(fd, "actual_cost"));
    const numbers = [costMin, costMax, quotePrice, approvedBudget, actualCost];

    if (numbers.some((value) => typeof value === "number" && !Number.isFinite(value))) {
      return data<ActionResult>(
        { error: "Bitte gültige Kostenwerte verwenden." },
        { status: 400, headers: responseHeaders() },
      );
    }

    if (!text(fd, "title")) {
      return data<ActionResult>(
        { error: "Eine Maßnahme benötigt einen Titel." },
        { status: 400, headers: responseHeaders() },
      );
    }

    const { error } = await supabase.rpc("save_lead_sales_readiness_measure", {
      p_check_id: checkId,
      p_measure_id: measureId,
      p_expected_check_version: expectedVersion,
      p_category: text(fd, "category") || "OTHER",
      p_title: text(fd, "title"),
      p_description: text(fd, "description"),
      p_decision: text(fd, "decision") || "OPEN",
      p_rationale: text(fd, "rationale"),
      p_cost_min: costMin,
      p_cost_max: costMax,
      p_quote_price: quotePrice,
      p_approved_budget: approvedBudget,
      p_actual_cost: actualCost,
      p_responsible_party: text(fd, "responsible_party"),
      p_partner_company: text(fd, "partner_company") || null,
      p_target_date: dateOrNull(text(fd, "target_date")),
      p_status: text(fd, "status") || "PROPOSED",
      p_owner_approval_status: text(fd, "owner_approval_status") || "NOT_REQUESTED",
      p_owner_approval_at: dateOrNull(text(fd, "owner_approval_at")),
      p_planned_start_date: dateOrNull(text(fd, "planned_start_date")),
      p_planned_end_date: dateOrNull(text(fd, "planned_end_date")),
      p_completed_at: dateOrNull(text(fd, "completed_at")),
      p_sort_order: Math.max(0, Number(text(fd, "sort_order")) || 0),
    });

    if (error) {
      return data<ActionResult>(
        { error: errorMessage(error, "Maßnahme konnte nicht gespeichert werden.") },
        { status: 400, headers: responseHeaders() },
      );
    }
    return data<ActionResult>(
      { ok: measureId ? "Maßnahme gespeichert." : "Maßnahme angelegt." },
      { headers: responseHeaders() },
    );
  }

  if (intent === "delete_measure") {
    const { error } = await supabase.rpc("delete_lead_sales_readiness_measure", {
      p_check_id: checkId,
      p_measure_id: text(fd, "measure_id"),
      p_expected_check_version: expectedVersion,
    });
    if (error) {
      return data<ActionResult>(
        { error: errorMessage(error, "Maßnahme konnte nicht entfernt werden.") },
        { status: 400, headers: responseHeaders() },
      );
    }
    return data<ActionResult>(
      { ok: "Maßnahme entfernt." },
      { headers: responseHeaders() },
    );
  }

  if (intent === "ready") {
    const { error } = await supabase.rpc("mark_lead_sales_readiness_ready", {
      p_check_id: checkId,
      p_expected_version: expectedVersion,
    });
    if (error) {
      return data<ActionResult>(
        { error: errorMessage(error, "Check konnte nicht auf prüfbereit gesetzt werden.") },
        { status: 400, headers: responseHeaders() },
      );
    }
    return data<ActionResult>(
      { ok: "Check ist prüfbereit. Jetzt kann die Eigentümerentscheidung dokumentiert werden." },
      { headers: responseHeaders() },
    );
  }

  if (intent === "finalize") {
    const { error } = await supabase.rpc("finalize_lead_sales_readiness_check", {
      p_check_id: checkId,
      p_expected_version: expectedVersion,
    });
    if (error) {
      return data<ActionResult>(
        { error: errorMessage(error, "Finalisierung war nicht möglich.") },
        { status: 400, headers: responseHeaders() },
      );
    }
    return data<ActionResult>(
      { ok: "Check finalisiert. Die Beratungsrevision ist jetzt unveränderlich." },
      { headers: responseHeaders() },
    );
  }

  if (intent === "revision") {
    const { error } = await supabase.rpc("create_lead_sales_readiness_revision", {
      p_check_id: checkId,
      p_expected_version: expectedVersion,
    });
    if (error) {
      return data<ActionResult>(
        { error: errorMessage(error, "Revision konnte nicht angelegt werden.") },
        { status: 400, headers: responseHeaders() },
      );
    }
    return data<ActionResult>(
      { ok: "Neue Revision angelegt. Die Eigentümerentscheidung wird bewusst neu eingeholt." },
      { headers: responseHeaders() },
    );
  }

  if (intent === "create_tasks") {
    const { data: canTask } = await supabase.rpc("current_user_has_permission", {
      p_permission: "task.write",
    });
    if (canTask !== true) {
      return data<ActionResult>(
        { error: "Keine Berechtigung zum Erzeugen von CRM-Aufgaben." },
        { status: 403, headers: responseHeaders() },
      );
    }

    const measureIds = fd.getAll("measure_ids").map(String).filter(Boolean);
    if (!measureIds.length) {
      return data<ActionResult>(
        { error: "Bitte mindestens eine Maßnahme auswählen." },
        { status: 400, headers: responseHeaders() },
      );
    }

    const { error } = await supabase.rpc("create_tasks_from_sales_readiness_measures", {
      p_check_id: checkId,
      p_measure_ids: measureIds,
      p_expected_check_version: expectedVersion,
    });
    if (error) {
      return data<ActionResult>(
        { error: errorMessage(error, "CRM-Aufgaben konnten nicht erzeugt werden.") },
        { status: 400, headers: responseHeaders() },
      );
    }
    return data<ActionResult>(
      { ok: "CRM-Aufgaben wurden idempotent erzeugt bzw. bereits vorhandene wiederverwendet." },
      { headers: responseHeaders() },
    );
  }

  return data<ActionResult>(
    { error: "Unbekannte Aktion." },
    { status: 400, headers: responseHeaders() },
  );
}

export default function LeadSalesReadiness() {
  const { viewModel, profile, canWrite, canFinalize, canTask, aiConfigured } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();

  return (
    <main className="editor-shell lead-shell readiness-shell">
      <header className="editor-header">
        <div>
          <Link className="back-link" to={`/leads/${viewModel.lead.id}`}>← Lead-Detail</Link>
          <p className="eyebrow">Modul 03 · Verkaufsfertig</p>
          <h1 className="editor-title">Verkaufsfertig-Check</h1>
          <p className="editor-meta">Szenarien vergleichen, Eigentümerentscheidung dokumentieren und die Verkaufsaufbereitung steuern.</p>
        </div>
        <div className="header-user">
          <span className="badge">{__APP_ENV_LABEL__}</span>
          <small>{profile.display_name}</small>
        </div>
      </header>

      {result?.error ? <div className="form-error readiness-feedback">{result.error}</div> : null}
      {result?.ok ? <div className="success-banner readiness-feedback">{result.ok}</div> : null}

      {viewModel.check.id ? (
        <SalesReadinessAiPanel
          leadId={viewModel.lead.id}
          scenarios={viewModel.scenarios.map(({ id, kind, title }) => ({ id, kind, title }))}
          canWrite={canWrite && viewModel.check.status !== "FINALIZED"}
          configured={aiConfigured}
        />
      ) : null}

      <SalesReadinessWorkspace
        viewModel={viewModel}
        canWrite={canWrite}
        canFinalize={canFinalize}
        canTask={canTask}
      />
    </main>
  );
}
