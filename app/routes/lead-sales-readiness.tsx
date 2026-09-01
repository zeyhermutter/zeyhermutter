import { data, Link, useActionData, useLoaderData } from "react-router";
import type { Route } from "./+types/lead-sales-readiness";
import { SalesReadinessWorkspace } from "~/components/sales-readiness-workspace";
import { requirePermission } from "~/lib/auth.server";
import { loadSalesReadiness, requireSalesReadinessBackend } from "~/lib/sales-readiness.server";
import "~/sales-readiness.css";
import "~/sales-readiness-editor.css";

type ActionResult = { error?: string; ok?: string };
function text(fd: FormData, key: string) { return String(fd.get(key) ?? "").trim(); }
function nullableNumber(value: string) {
  if (!value) return null;
  const normalized = value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value;
  const n = Number(normalized);
  return Number.isFinite(n) ? n : NaN;
}
function inspectionIso(value: string) { return value ? `${value}T12:00:00.000Z` : null; }
function errorMessage(error: any, fallback: string) {
  const message = String(error?.message ?? "");
  if (message.includes("CONFLICT") || message.includes("incomplete") || message.includes("INCOMPLETE")) return "Der Check wurde inzwischen geändert oder ist noch nicht vollständig. Bitte neu laden und Angaben prüfen.";
  if (message.includes("THREE_SCENARIOS") || message.includes("REVIEW_REQUIRES")) return "Für diesen Schritt werden genau drei Szenarien und genau eine Empfehlung benötigt.";
  if (message.includes("FINALIZED_SALES_READINESS")) return "Finalisierte Checks sind unveränderlich. Bitte eine Revision anlegen.";
  return fallback;
}

export function meta() {
  return [{ title: "Verkaufsfertig-Check · ZeyherMutterOS" }, { name: "robots", content: "noindex, nofollow" }];
}

export async function loader({ request, context, params }: Route.LoaderArgs) {
  requireSalesReadinessBackend(context.cloudflare.env);
  const { supabase, responseHeaders, profile } = await requirePermission(request, context.cloudflare.env, "sales_readiness.read");
  if (!params.leadId) throw new Response("Lead fehlt.", { status: 404 });
  const { data: canReadLead } = await supabase.rpc("current_user_has_permission", { p_permission: "lead.read" });
  if (canReadLead !== true) throw new Response("Keine Berechtigung für diesen Lead.", { status: 403, headers: responseHeaders() });
  const [{ data: canWrite }, { data: canFinalize }, { data: canTask }] = await Promise.all([
    supabase.rpc("current_user_has_permission", { p_permission: "sales_readiness.write" }),
    supabase.rpc("current_user_has_permission", { p_permission: "sales_readiness.finalize" }),
    supabase.rpc("current_user_has_permission", { p_permission: "task.write" }),
  ]);
  const viewModel = await loadSalesReadiness(supabase, params.leadId);
  return data({ viewModel, profile, canWrite: canWrite === true, canFinalize: canFinalize === true, canTask: canTask === true }, { headers: responseHeaders() });
}

export async function action({ request, context, params }: Route.ActionArgs) {
  requireSalesReadinessBackend(context.cloudflare.env);
  if (!params.leadId) throw new Response("Lead fehlt.", { status: 404 });
  const fd = await request.formData();
  const intent = text(fd, "_intent");
  const permission = intent === "finalize" || intent === "revision" ? "sales_readiness.finalize" : "sales_readiness.write";
  const { supabase, responseHeaders } = await requirePermission(request, context.cloudflare.env, permission);
  const leadId = params.leadId;

  if (intent === "create") {
    const { error } = await supabase.rpc("create_lead_sales_readiness_draft", { p_lead_id: leadId });
    if (error) return data<ActionResult>({ error: errorMessage(error, "Entwurf konnte nicht angelegt werden.") }, { status: 400, headers: responseHeaders() });
    return data<ActionResult>({ ok: "Verkaufsfertig-Check angelegt." }, { headers: responseHeaders() });
  }

  const checkId = text(fd, "check_id");
  const expectedVersion = Number(text(fd, "version"));
  if (!checkId || !Number.isFinite(expectedVersion)) return data<ActionResult>({ error: "Ungültiger Check-Kontext." }, { status: 400, headers: responseHeaders() });

  if (intent === "save_check") {
    const { data: updated, error } = await supabase.from("lead_sales_readiness_checks").update({
      inspection_at: inspectionIso(text(fd, "inspection_date")),
      starting_situation: text(fd, "starting_situation"),
      sale_objective: text(fd, "sale_objective"),
      desired_timeframe: text(fd, "desired_timeframe"),
      overall_assessment: text(fd, "overall_assessment"),
      assumptions_and_uncertainties: text(fd, "assumptions_and_uncertainties"),
    }).eq("id", checkId).eq("lead_id", leadId).eq("version", expectedVersion).neq("status", "FINALIZED").select("id").maybeSingle();
    if (error) return data<ActionResult>({ error: errorMessage(error, "Grunddaten konnten nicht gespeichert werden.") }, { status: 400, headers: responseHeaders() });
    if (!updated) return data<ActionResult>({ error: "Der Check wurde inzwischen geändert. Bitte neu laden." }, { status: 409, headers: responseHeaders() });
    return data<ActionResult>({ ok: "Grunddaten gespeichert." }, { headers: responseHeaders() });
  }

  if (intent === "save_scenario") {
    const scenarioId = text(fd, "scenario_id");
    const numbers = {
      investment_min: nullableNumber(text(fd, "investment_min")), investment_max: nullableNumber(text(fd, "investment_max")),
      estimated_sale_price_min: nullableNumber(text(fd, "estimated_sale_price_min")), estimated_sale_price_max: nullableNumber(text(fd, "estimated_sale_price_max")),
      duration_weeks_min: nullableNumber(text(fd, "duration_weeks_min")), duration_weeks_max: nullableNumber(text(fd, "duration_weeks_max")),
    };
    if (Object.values(numbers).some((v) => typeof v === "number" && !Number.isFinite(v))) return data<ActionResult>({ error: "Bitte nur gültige Zahlen verwenden." }, { status: 400, headers: responseHeaders() });
    const recommended = fd.get("is_recommended") === "on";
    if (recommended) {
      const { error: clearError } = await supabase.from("lead_sales_readiness_scenarios").update({ is_recommended: false }).eq("check_id", checkId).neq("id", scenarioId);
      if (clearError) return data<ActionResult>({ error: "Empfehlung konnte nicht aktualisiert werden." }, { status: 400, headers: responseHeaders() });
    }
    const { error } = await supabase.from("lead_sales_readiness_scenarios").update({
      title: text(fd, "title"), description: text(fd, "description"), assumptions: text(fd, "assumptions"),
      confidence: text(fd, "confidence") || "LOW", ...numbers, is_recommended: recommended,
    }).eq("id", scenarioId).eq("check_id", checkId);
    if (error) return data<ActionResult>({ error: errorMessage(error, "Szenario konnte nicht gespeichert werden.") }, { status: 400, headers: responseHeaders() });
    return data<ActionResult>({ ok: "Szenario gespeichert." }, { headers: responseHeaders() });
  }

  if (intent === "save_measure") {
    const measureId = text(fd, "measure_id");
    const numbers = { cost_min: nullableNumber(text(fd, "cost_min")), cost_max: nullableNumber(text(fd, "cost_max")) };
    if (Object.values(numbers).some((v) => typeof v === "number" && !Number.isFinite(v))) return data<ActionResult>({ error: "Bitte gültige Kostenwerte verwenden." }, { status: 400, headers: responseHeaders() });
    const payload = {
      category: text(fd, "category") || "OTHER", title: text(fd, "title"), description: text(fd, "description"),
      decision: text(fd, "decision") || "OPEN", rationale: text(fd, "rationale"), ...numbers,
      responsible_party: text(fd, "responsible_party"), partner_company: text(fd, "partner_company") || null,
      target_date: text(fd, "target_date") || null, status: text(fd, "status") || "OPEN",
      sort_order: Math.max(0, Number(text(fd, "sort_order")) || 0),
    };
    if (!payload.title) return data<ActionResult>({ error: "Eine Maßnahme benötigt einen Titel." }, { status: 400, headers: responseHeaders() });
    const query = measureId
      ? supabase.from("lead_sales_readiness_measures").update(payload).eq("id", measureId).eq("check_id", checkId)
      : supabase.from("lead_sales_readiness_measures").insert({ ...payload, check_id: checkId });
    const { error } = await query;
    if (error) return data<ActionResult>({ error: errorMessage(error, "Maßnahme konnte nicht gespeichert werden.") }, { status: 400, headers: responseHeaders() });
    return data<ActionResult>({ ok: measureId ? "Maßnahme gespeichert." : "Maßnahme angelegt." }, { headers: responseHeaders() });
  }

  if (intent === "delete_measure") {
    const { error } = await supabase.from("lead_sales_readiness_measures").delete().eq("id", text(fd, "measure_id")).eq("check_id", checkId);
    if (error) return data<ActionResult>({ error: errorMessage(error, "Maßnahme konnte nicht entfernt werden.") }, { status: 400, headers: responseHeaders() });
    return data<ActionResult>({ ok: "Maßnahme entfernt." }, { headers: responseHeaders() });
  }

  if (intent === "ready") {
    const { error } = await supabase.rpc("mark_lead_sales_readiness_ready", { p_check_id: checkId, p_expected_version: expectedVersion });
    if (error) return data<ActionResult>({ error: errorMessage(error, "Check konnte nicht auf prüfbereit gesetzt werden.") }, { status: 400, headers: responseHeaders() });
    return data<ActionResult>({ ok: "Check ist prüfbereit." }, { headers: responseHeaders() });
  }

  if (intent === "finalize") {
    const { error } = await supabase.rpc("finalize_lead_sales_readiness_check", { p_check_id: checkId, p_expected_version: expectedVersion });
    if (error) return data<ActionResult>({ error: errorMessage(error, "Finalisierung war nicht möglich.") }, { status: 400, headers: responseHeaders() });
    return data<ActionResult>({ ok: "Check finalisiert." }, { headers: responseHeaders() });
  }

  if (intent === "revision") {
    const { error } = await supabase.rpc("create_lead_sales_readiness_revision", { p_check_id: checkId, p_expected_version: expectedVersion });
    if (error) return data<ActionResult>({ error: errorMessage(error, "Revision konnte nicht angelegt werden.") }, { status: 400, headers: responseHeaders() });
    return data<ActionResult>({ ok: "Neue Revision angelegt." }, { headers: responseHeaders() });
  }

  if (intent === "create_tasks") {
    const { data: canTask } = await supabase.rpc("current_user_has_permission", { p_permission: "task.write" });
    if (canTask !== true) return data<ActionResult>({ error: "Keine Berechtigung zum Erzeugen von CRM-Aufgaben." }, { status: 403, headers: responseHeaders() });
    const measureIds = fd.getAll("measure_ids").map(String).filter(Boolean);
    if (!measureIds.length) return data<ActionResult>({ error: "Bitte mindestens eine Maßnahme auswählen." }, { status: 400, headers: responseHeaders() });
    const { error } = await supabase.rpc("create_tasks_from_sales_readiness_measures", { p_check_id: checkId, p_measure_ids: measureIds, p_expected_check_version: expectedVersion });
    if (error) return data<ActionResult>({ error: errorMessage(error, "CRM-Aufgaben konnten nicht erzeugt werden.") }, { status: 400, headers: responseHeaders() });
    return data<ActionResult>({ ok: "CRM-Aufgaben wurden idempotent erzeugt bzw. bereits vorhandene wiederverwendet." }, { headers: responseHeaders() });
  }

  return data<ActionResult>({ error: "Unbekannte Aktion." }, { status: 400, headers: responseHeaders() });
}

export default function LeadSalesReadiness() {
  const { viewModel, profile, canWrite, canFinalize, canTask } = useLoaderData<typeof loader>();
  const result = useActionData<typeof action>();
  return (
    <main className="editor-shell lead-shell readiness-shell">
      <header className="editor-header">
        <div>
          <Link className="back-link" to={`/leads/${viewModel.lead.id}`}>← Lead-Detail</Link>
          <p className="eyebrow">Modul 03 · Verkaufsfertig</p>
          <h1 className="editor-title">Verkaufsfertig-Check</h1>
          <p className="editor-meta">Szenarien vergleichen, Maßnahmen priorisieren und die Verkaufsaufbereitung planen.</p>
        </div>
        <div className="header-user"><span className="badge">{__APP_ENV_LABEL__}</span><small>{profile.display_name}</small></div>
      </header>
      {result?.error ? <div className="form-error readiness-feedback">{result.error}</div> : null}
      {result?.ok ? <div className="success-banner readiness-feedback">{result.ok}</div> : null}
      <SalesReadinessWorkspace viewModel={viewModel} canWrite={canWrite} canFinalize={canFinalize} canTask={canTask} />
    </main>
  );
}
