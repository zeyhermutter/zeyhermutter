import {
  emptySalesReadinessViewModel,
  type SalesReadinessConfidence,
  type SalesReadinessDecision,
  type SalesReadinessMeasureStatus,
  type SalesReadinessStatus,
  type SalesReadinessViewModel,
} from "~/lib/sales-readiness";

type SupabaseQueryClient = { from(table: string): any };
type FeatureEnv = Env & { SALES_READINESS_BACKEND_ENABLED?: string; SELLER_CHECK_PUBLIC_ENABLED?: string };

export function isSalesReadinessBackendEnabled(env: Env) {
  return String((env as FeatureEnv).SALES_READINESS_BACKEND_ENABLED ?? "").toLowerCase() === "true";
}
export function isSellerCheckPublicEnabled(env: Env) {
  return String((env as FeatureEnv).SELLER_CHECK_PUBLIC_ENABLED ?? "").toLowerCase() === "true";
}
export function requireSalesReadinessBackend(env: Env) {
  if (!isSalesReadinessBackendEnabled(env)) throw new Response("Nicht verfügbar.", { status: 404 });
}

function one<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}
function numeric(value: unknown) {
  return value === null || value === undefined || value === "" ? null : Number(value);
}

export async function loadSalesReadiness(
  supabase: SupabaseQueryClient,
  leadId: string,
): Promise<SalesReadinessViewModel> {
  const { data: lead, error } = await supabase
    .from("leads")
    .select("id,lead_number,property_street,property_house_number,property_postal_code,property_city,primary_responsible_user,contacts!inner(first_name,last_name),responsible_profile:profiles!leads_primary_responsible_user_fkey(display_name)")
    .eq("id", leadId)
    .maybeSingle();
  if (error || !lead) throw new Response("Lead nicht gefunden.", { status: 404 });

  const contact = one<any>(lead.contacts);
  const leadResponsible = one<any>(lead.responsible_profile);
  const street = [lead.property_street, lead.property_house_number].filter(Boolean).join(" ");
  const city = [lead.property_postal_code, lead.property_city].filter(Boolean).join(" ");
  const propertyLabel = [street, city].filter(Boolean).join(", ") || "Objektangaben noch offen";
  const base = emptySalesReadinessViewModel({
    leadId: lead.id,
    leadNumber: lead.lead_number,
    contactLabel: [contact?.first_name, contact?.last_name].filter(Boolean).join(" ") || "Kontakt",
    propertyLabel,
    responsibleUserLabel: leadResponsible?.display_name ?? "Noch offen",
  });

  const { data: check, error: checkError } = await supabase
    .from("lead_sales_readiness_checks")
    .select("id,status,inspection_at,starting_situation,sale_objective,desired_timeframe,overall_assessment,assumptions_and_uncertainties,responsible_user,version")
    .eq("lead_id", leadId)
    .eq("is_current", true)
    .maybeSingle();
  if (checkError) throw new Response("Verkaufsfertig-Check konnte nicht geladen werden.", { status: 500 });
  if (!check) return base;

  const [scenarioResult, measureResult, taskResult, responsibleResult] = await Promise.all([
    supabase.from("lead_sales_readiness_scenarios").select("*").eq("check_id", check.id).order("sort_order"),
    supabase.from("lead_sales_readiness_measures").select("*").eq("check_id", check.id).order("sort_order"),
    supabase.from("tasks").select("sales_readiness_measure_id").eq("lead_id", leadId).not("sales_readiness_measure_id", "is", null),
    supabase.from("profiles").select("display_name").eq("user_id", check.responsible_user).maybeSingle(),
  ]);
  if (scenarioResult.error || measureResult.error || taskResult.error || responsibleResult.error) {
    throw new Response("Verkaufsfertig-Arbeitsbereich konnte nicht vollständig geladen werden.", { status: 500 });
  }

  const taskMeasureIds = new Set((taskResult.data ?? []).map((row: any) => row.sales_readiness_measure_id).filter(Boolean));
  return {
    lead: base.lead,
    check: {
      id: check.id,
      status: check.status as SalesReadinessStatus,
      inspectionAt: check.inspection_at,
      startingSituation: check.starting_situation ?? "",
      saleObjective: check.sale_objective ?? "",
      desiredTimeframe: check.desired_timeframe ?? "",
      overallAssessment: check.overall_assessment ?? "",
      assumptionsAndUncertainties: check.assumptions_and_uncertainties ?? "",
      responsibleUserLabel: responsibleResult.data?.display_name ?? base.check.responsibleUserLabel,
      version: Number(check.version),
    },
    scenarios: (scenarioResult.data ?? []).map((row: any) => ({
      id: row.id,
      kind: row.scenario_kind,
      title: row.title,
      description: row.description ?? "",
      assumptions: row.assumptions ?? "",
      confidence: row.confidence as SalesReadinessConfidence,
      investmentMin: numeric(row.investment_min),
      investmentMax: numeric(row.investment_max),
      estimatedSalePriceMin: numeric(row.estimated_sale_price_min),
      estimatedSalePriceMax: numeric(row.estimated_sale_price_max),
      durationWeeksMin: numeric(row.duration_weeks_min),
      durationWeeksMax: numeric(row.duration_weeks_max),
      recommended: Boolean(row.is_recommended),
    })),
    measures: (measureResult.data ?? []).map((row: any) => ({
      id: row.id,
      category: row.category,
      title: row.title,
      description: row.description ?? "",
      decision: row.decision as SalesReadinessDecision,
      rationale: row.rationale ?? "",
      costMin: numeric(row.cost_min),
      costMax: numeric(row.cost_max),
      responsibleParty: row.responsible_party ?? "",
      partnerCompany: row.partner_company,
      targetDate: row.target_date,
      status: row.status as SalesReadinessMeasureStatus,
      sortOrder: Number(row.sort_order),
      selectedForTasks: taskMeasureIds.has(row.id),
    })),
  };
}
