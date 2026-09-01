import {
  emptySalesReadinessViewModel,
  type SalesReadinessConfidence,
  type SalesReadinessDecision,
  type SalesReadinessMeasureStatus,
  type SalesReadinessOwnerApprovalStatus,
  type SalesReadinessOwnerDecision,
  type SalesReadinessScenarioViewModel,
  type SalesReadinessStatus,
  type SalesReadinessViewModel,
} from "~/lib/sales-readiness";

type SupabaseQueryClient = { from(table: string): any };
type FeatureEnv = Env & {
  SALES_READINESS_BACKEND_ENABLED?: string;
  SELLER_CHECK_PUBLIC_ENABLED?: string;
};

export function isSalesReadinessBackendEnabled(env: Env) {
  return String((env as FeatureEnv).SALES_READINESS_BACKEND_ENABLED ?? "").toLowerCase() === "true";
}

export function isSellerCheckPublicEnabled(env: Env) {
  return String((env as FeatureEnv).SELLER_CHECK_PUBLIC_ENABLED ?? "").toLowerCase() === "true";
}

export function requireSalesReadinessBackend(env: Env) {
  if (!isSalesReadinessBackendEnabled(env)) {
    throw new Response("Nicht verfügbar.", { status: 404 });
  }
}

function one<T>(value: T | T[] | null | undefined): T | undefined {
  return Array.isArray(value) ? value[0] : value ?? undefined;
}

function numeric(value: unknown) {
  return value === null || value === undefined || value === "" ? null : Number(value);
}

function present(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function addScenarioEffects(
  scenarios: Omit<
    SalesReadinessScenarioViewModel,
    "estimatedUpliftMin" | "estimatedUpliftMax" | "economicAdvantageMin" | "economicAdvantageMax"
  >[],
): SalesReadinessScenarioViewModel[] {
  const base = scenarios.find((scenario) => scenario.kind === "AS_IS");

  return scenarios.map((scenario) => {
    if (
      !base
      || scenario.kind === "AS_IS"
      || scenario.estimatedSalePriceMin === null
      || scenario.estimatedSalePriceMax === null
      || base.estimatedSalePriceMin === null
      || base.estimatedSalePriceMax === null
    ) {
      return {
        ...scenario,
        estimatedUpliftMin: null,
        estimatedUpliftMax: null,
        economicAdvantageMin: null,
        economicAdvantageMax: null,
      };
    }

    // Conservative interval comparison: worst optimized price vs. best as-is price,
    // and best optimized price vs. worst as-is price.
    const estimatedUpliftMin = scenario.estimatedSalePriceMin - base.estimatedSalePriceMax;
    const estimatedUpliftMax = scenario.estimatedSalePriceMax - base.estimatedSalePriceMin;
    const economicAdvantageMin = scenario.investmentMax === null
      ? null
      : estimatedUpliftMin - scenario.investmentMax;
    const economicAdvantageMax = scenario.investmentMin === null
      ? null
      : estimatedUpliftMax - scenario.investmentMin;

    return {
      ...scenario,
      estimatedUpliftMin,
      estimatedUpliftMax,
      economicAdvantageMin,
      economicAdvantageMax,
    };
  });
}

function reviewMissing(
  check: SalesReadinessViewModel["check"],
  scenarios: SalesReadinessScenarioViewModel[],
  measures: SalesReadinessViewModel["measures"],
) {
  const missing: string[] = [];

  if (!check.inspectionAt) missing.push("Besichtigungsdatum erfassen");
  if (!present(check.startingSituation)) missing.push("Ausgangssituation beschreiben");
  if (!present(check.saleObjective)) missing.push("Verkaufsziel dokumentieren");
  if (!present(check.overallAssessment)) missing.push("Gesamtbeurteilung ergänzen");
  if (!present(check.assumptionsAndUncertainties)) missing.push("Annahmen und Unsicherheiten ergänzen");

  if (scenarios.length !== 3) {
    missing.push("genau drei Verkaufsszenarien anlegen");
  }

  if (scenarios.filter((scenario) => scenario.recommended).length !== 1) {
    missing.push("genau ein Verkaufsszenario empfehlen");
  }

  scenarios.forEach((scenario) => {
    const prefix = scenario.title || "Szenario";
    if (!present(scenario.description)) missing.push(`${prefix}: Beschreibung ergänzen`);
    if (!present(scenario.assumptions)) missing.push(`${prefix}: Annahmen ergänzen`);
    if (!present(scenario.internalAssessment)) missing.push(`${prefix}: interne Bewertung ergänzen`);
    if (scenario.estimatedSalePriceMin === null || scenario.estimatedSalePriceMax === null) {
      missing.push(`${prefix}: Verkaufspreisspanne ergänzen`);
    }
    if (scenario.durationWeeksMin === null || scenario.durationWeeksMax === null) {
      missing.push(`${prefix}: Vorbereitungsdauer ergänzen`);
    }
    if (
      scenario.kind !== "AS_IS"
      && (scenario.investmentMin === null || scenario.investmentMax === null)
    ) {
      missing.push(`${prefix}: Investitionsspanne ergänzen`);
    }
    if (scenario.recommended && !present(scenario.recommendationRationale)) {
      missing.push(`${prefix}: Empfehlungsbegründung ergänzen`);
    }
  });

  if (measures.some((measure) => measure.decision === "OPEN")) {
    missing.push("alle Maßnahmen fachlich entscheiden");
  }

  return [...new Set(missing)];
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

  if (error || !lead) {
    throw new Response("Lead nicht gefunden.", { status: 404 });
  }

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
    .select("id,status,inspection_at,starting_situation,sale_objective,desired_timeframe,overall_assessment,assumptions_and_uncertainties,responsible_user,owner_decision,owner_decision_at,owner_decision_by,owner_decision_note,version")
    .eq("lead_id", leadId)
    .eq("is_current", true)
    .maybeSingle();

  if (checkError) {
    throw new Response("Verkaufsfertig-Check konnte nicht geladen werden.", { status: 500 });
  }

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

  const taskMeasureIds = new Set(
    (taskResult.data ?? []).map((row: any) => row.sales_readiness_measure_id).filter(Boolean),
  );

  const checkModel: SalesReadinessViewModel["check"] = {
    id: check.id,
    status: check.status as SalesReadinessStatus,
    inspectionAt: check.inspection_at,
    startingSituation: check.starting_situation ?? "",
    saleObjective: check.sale_objective ?? "",
    desiredTimeframe: check.desired_timeframe ?? "",
    overallAssessment: check.overall_assessment ?? "",
    assumptionsAndUncertainties: check.assumptions_and_uncertainties ?? "",
    responsibleUserLabel: responsibleResult.data?.display_name ?? base.check.responsibleUserLabel,
    ownerDecision: (check.owner_decision ?? "OPEN") as SalesReadinessOwnerDecision,
    ownerDecisionAt: check.owner_decision_at,
    ownerDecisionBy: check.owner_decision_by ?? "",
    ownerDecisionNote: check.owner_decision_note ?? "",
    version: Number(check.version),
  };

  const rawScenarios = (scenarioResult.data ?? []).map((row: any) => ({
    id: row.id,
    kind: row.scenario_kind as SalesReadinessScenarioViewModel["kind"],
    title: row.title,
    description: row.description ?? "",
    assumptions: row.assumptions ?? "",
    internalAssessment: row.internal_assessment ?? "",
    recommendationRationale: row.recommendation_rationale ?? "",
    confidence: row.confidence as SalesReadinessConfidence,
    investmentMin: numeric(row.investment_min),
    investmentMax: numeric(row.investment_max),
    estimatedSalePriceMin: numeric(row.estimated_sale_price_min),
    estimatedSalePriceMax: numeric(row.estimated_sale_price_max),
    durationWeeksMin: numeric(row.duration_weeks_min),
    durationWeeksMax: numeric(row.duration_weeks_max),
    recommended: Boolean(row.is_recommended),
  }));

  const scenarios = addScenarioEffects(rawScenarios);

  const measures: SalesReadinessViewModel["measures"] = (measureResult.data ?? []).map((row: any) => ({
    id: row.id,
    category: row.category,
    title: row.title,
    description: row.description ?? "",
    decision: row.decision as SalesReadinessDecision,
    rationale: row.rationale ?? "",
    costMin: numeric(row.cost_min),
    costMax: numeric(row.cost_max),
    quotePrice: numeric(row.quote_price),
    approvedBudget: numeric(row.approved_budget),
    actualCost: numeric(row.actual_cost),
    responsibleParty: row.responsible_party ?? "",
    partnerCompany: row.partner_company,
    targetDate: row.target_date,
    status: row.status as SalesReadinessMeasureStatus,
    ownerApprovalStatus: (row.owner_approval_status ?? "NOT_REQUESTED") as SalesReadinessOwnerApprovalStatus,
    ownerApprovalAt: row.owner_approval_at,
    plannedStartDate: row.planned_start_date,
    plannedEndDate: row.planned_end_date,
    completedAt: row.completed_at,
    sortOrder: Number(row.sort_order),
    selectedForTasks: taskMeasureIds.has(row.id),
  }));

  const missingForReview = reviewMissing(checkModel, scenarios, measures);
  const reviewable = missingForReview.length === 0;
  const finalizable = checkModel.status === "READY_FOR_REVIEW"
    && reviewable
    && checkModel.ownerDecision !== "OPEN";

  const actionableMeasures = measures.filter(
    (measure) => ["URGENTLY_RECOMMENDED", "RECOMMENDED", "OPTIONAL"].includes(measure.decision)
      && measure.status !== "DISMISSED",
  );

  let nextAction = "Check vervollständigen";
  if (checkModel.status === "FINALIZED") {
    nextAction = actionableMeasures.some((measure) => !measure.selectedForTasks && !["DONE", "CHECKED"].includes(measure.status))
      ? "CRM-Aufgaben aus freigegebenen Maßnahmen erzeugen"
      : "Verkaufsaufbereitung steuern";
  } else if (checkModel.status === "READY_FOR_REVIEW") {
    nextAction = checkModel.ownerDecision === "OPEN"
      ? "Eigentümerentscheidung dokumentieren"
      : "Check finalisieren";
  } else if (reviewable) {
    nextAction = "Check zur Prüfung markieren";
  } else if (missingForReview[0]) {
    nextAction = `Check vervollständigen: ${missingForReview[0]}`;
  }

  return {
    lead: base.lead,
    check: checkModel,
    scenarios,
    measures,
    workflow: {
      reviewable,
      finalizable,
      missingForReview,
      nextAction,
    },
    summary: {
      estimatedCostMin: actionableMeasures.reduce((sum, measure) => sum + (measure.costMin ?? 0), 0),
      estimatedCostMax: actionableMeasures.reduce((sum, measure) => sum + (measure.costMax ?? 0), 0),
      approvedBudget: actionableMeasures.reduce((sum, measure) => sum + (measure.approvedBudget ?? 0), 0),
      actualCost: actionableMeasures.reduce((sum, measure) => sum + (measure.actualCost ?? 0), 0),
    },
  };
}
