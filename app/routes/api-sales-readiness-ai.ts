import { data } from "react-router";
import type { Route } from "./+types/api-sales-readiness-ai";
import { requirePermission } from "~/lib/auth.server";
import { generateSalesReadinessAiDraft, type SalesReadinessAiTarget } from "~/lib/sales-readiness-ai.server";
import { loadSalesReadiness, requireSalesReadinessBackend } from "~/lib/sales-readiness.server";

const TARGETS = new Set<SalesReadinessAiTarget>([
  "starting_situation",
  "sale_objective",
  "overall_assessment",
  "scenario",
]);

function sameOrigin(request: Request, baseUrl: string) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return origin === new URL(baseUrl).origin;
  } catch {
    return false;
  }
}

export async function loader() {
  throw new Response("Method Not Allowed", { status: 405 });
}

export async function action({ request, context }: Route.ActionArgs) {
  requireSalesReadinessBackend(context.cloudflare.env);
  if (request.method !== "POST") throw new Response("Method Not Allowed", { status: 405 });
  if (!sameOrigin(request, context.cloudflare.env.APP_BASE_URL)) {
    throw new Response("Forbidden", { status: 403 });
  }

  const { supabase, responseHeaders } = await requirePermission(
    request,
    context.cloudflare.env,
    "sales_readiness.write",
  );

  let payload: any;
  try {
    payload = await request.json();
  } catch {
    return data({ ok: false, error: "Ungültige KI-Anfrage." }, { status: 400, headers: responseHeaders() });
  }

  const leadId = String(payload?.leadId ?? "").trim();
  const target = String(payload?.target ?? "").trim() as SalesReadinessAiTarget;
  const scenarioId = String(payload?.scenarioId ?? "").trim() || undefined;
  const form = payload?.form && typeof payload.form === "object" && !Array.isArray(payload.form)
    ? payload.form
    : undefined;

  if (!leadId || !TARGETS.has(target)) {
    return data({ ok: false, error: "Ungültiger KI-Baustein." }, { status: 400, headers: responseHeaders() });
  }

  const { data: canReadLead } = await supabase.rpc("current_user_has_permission", {
    p_permission: "lead.read",
  });
  if (canReadLead !== true) {
    return data({ ok: false, error: "Keine Berechtigung für diesen Lead." }, { status: 403, headers: responseHeaders() });
  }

  const viewModel = await loadSalesReadiness(supabase, leadId);
  if (!viewModel.check.id) {
    return data({ ok: false, error: "Bitte zuerst einen Verkaufsstrategie-Check anlegen." }, { status: 409, headers: responseHeaders() });
  }
  if (viewModel.check.status === "FINALIZED") {
    return data({ ok: false, error: "Finalisierte Checks sind unveränderlich. Bitte zuerst eine Revision anlegen." }, { status: 409, headers: responseHeaders() });
  }

  try {
    const fields = await generateSalesReadinessAiDraft({
      env: context.cloudflare.env,
      viewModel,
      target,
      scenarioId,
      form,
    });
    return data({ ok: true, fields }, { headers: responseHeaders() });
  } catch (error: any) {
    const message = String(error?.message ?? "");
    if (message === "AI_NOT_CONFIGURED") {
      return data({ ok: false, error: "ChatGPT ist für BETA noch nicht mit einem OpenAI API-Key verbunden." }, { status: 503, headers: responseHeaders() });
    }
    if (message === "AI_DISABLED") {
      return data({ ok: false, error: "Die KI-Bausteine sind in dieser Umgebung deaktiviert." }, { status: 503, headers: responseHeaders() });
    }
    if (message === "SCENARIO_NOT_FOUND") {
      return data({ ok: false, error: "Das Verkaufsszenario wurde nicht gefunden." }, { status: 404, headers: responseHeaders() });
    }
    console.error("sales-readiness-ai generation failed", error);
    return data({ ok: false, error: "Der KI-Entwurf konnte gerade nicht erstellt werden. Bitte erneut versuchen." }, { status: 502, headers: responseHeaders() });
  }
}
