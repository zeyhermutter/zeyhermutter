import type { SalesReadinessViewModel } from "~/lib/sales-readiness";

export type SalesReadinessAiTarget =
  | "starting_situation"
  | "sale_objective"
  | "overall_assessment"
  | "scenario";

type FormSnapshot = Record<string, string | number | boolean | null | undefined>;

function clean(value: unknown, max = 2400) {
  const text = String(value ?? "").trim();
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function compactObject(input: FormSnapshot | undefined) {
  if (!input) return {};
  return Object.fromEntries(
    Object.entries(input)
      .filter(([, value]) => value !== "" && value !== null && value !== undefined)
      .map(([key, value]) => [key, typeof value === "string" ? clean(value) : value]),
  );
}

function extractOutputText(payload: any) {
  if (typeof payload?.output_text === "string" && payload.output_text.trim()) {
    return payload.output_text.trim();
  }
  for (const item of Array.isArray(payload?.output) ? payload.output : []) {
    for (const part of Array.isArray(item?.content) ? item.content : []) {
      if (part?.type === "output_text" && typeof part?.text === "string" && part.text.trim()) {
        return part.text.trim();
      }
    }
  }
  return "";
}

function parseJsonText(text: string) {
  const stripped = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(stripped);
}

function euro(value: number | null | undefined) {
  if (value === null || value === undefined) return null;
  return new Intl.NumberFormat("de-DE", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(value);
}

function scenarioContext(viewModel: SalesReadinessViewModel, scenarioId?: string) {
  const scenario = viewModel.scenarios.find((item) => item.id === scenarioId);
  if (!scenario) return null;
  return {
    kind: scenario.kind,
    title: scenario.title,
    description: scenario.description,
    assumptions: scenario.assumptions,
    internalAssessment: scenario.internalAssessment,
    recommendationRationale: scenario.recommendationRationale,
    confidence: scenario.confidence,
    recommended: scenario.recommended,
    investmentMin: euro(scenario.investmentMin),
    investmentMax: euro(scenario.investmentMax),
    estimatedSalePriceMin: euro(scenario.estimatedSalePriceMin),
    estimatedSalePriceMax: euro(scenario.estimatedSalePriceMax),
    durationWeeksMin: scenario.durationWeeksMin,
    durationWeeksMax: scenario.durationWeeksMax,
    estimatedUpliftMin: euro(scenario.estimatedUpliftMin),
    estimatedUpliftMax: euro(scenario.estimatedUpliftMax),
    economicAdvantageMin: euro(scenario.economicAdvantageMin),
    economicAdvantageMax: euro(scenario.economicAdvantageMax),
  };
}

function buildContext(viewModel: SalesReadinessViewModel, form?: FormSnapshot, scenarioId?: string) {
  return {
    property: clean(viewModel.lead.propertyLabel, 600),
    check: {
      inspectionAt: viewModel.check.inspectionAt,
      startingSituation: viewModel.check.startingSituation,
      saleObjective: viewModel.check.saleObjective,
      desiredTimeframe: viewModel.check.desiredTimeframe,
      overallAssessment: viewModel.check.overallAssessment,
      assumptionsAndUncertainties: viewModel.check.assumptionsAndUncertainties,
    },
    currentForm: compactObject(form),
    scenario: scenarioContext(viewModel, scenarioId),
    measures: viewModel.measures.slice(0, 20).map((measure) => ({
      category: measure.category,
      title: clean(measure.title, 220),
      description: clean(measure.description, 800),
      decision: measure.decision,
      rationale: clean(measure.rationale, 800),
      costMin: euro(measure.costMin),
      costMax: euro(measure.costMax),
      status: measure.status,
    })),
  };
}

const SYSTEM_INSTRUCTIONS = `Du bist der interne KI-Schreibassistent eines deutschen Immobilienmaklers. Du formulierst ausschließlich Arbeitsentwürfe für einen Verkaufsfertig-Check.

Verbindliche Regeln:
- Schreibe professionelles, klares Deutsch ohne Werbeübertreibung.
- Nutze ausschließlich die gelieferten Informationen. Erfinde keine Fakten, Zahlen, Zustände, Termine, Mängel oder Eigentümerwünsche.
- Verändere oder ergänze keine Preis-, Kosten-, Dauer- oder Mehrerlöswerte. Zahlen dürfen nur aufgegriffen werden, wenn sie im Kontext vorhanden sind.
- Wenn Informationen fehlen oder unsicher sind, benenne die Unsicherheit sachlich statt etwas zu erfinden.
- Triff keine Eigentümerentscheidung und setze keinen Workflow-Status. Formuliere keine Rechts-, Steuer- oder Garantieaussagen.
- Gib nur den angeforderten Text bzw. das angeforderte JSON aus, ohne Vorrede und ohne Markdown-Codeblock.
- Personenbezogene Informationen sind für die Aufgabe nicht erforderlich und dürfen nicht ergänzt werden.`;

function promptFor(target: SalesReadinessAiTarget, context: unknown) {
  const source = JSON.stringify(context, null, 2);
  if (target === "starting_situation") {
    return `Formuliere die Ausgangssituation für den internen Verkaufsfertig-Check in etwa 90–150 Wörtern. Beschreibe den bekannten Ist-Zustand, den Anlass und erkennbare Rahmenbedingungen neutral und konkret. Keine Empfehlung vorwegnehmen.\n\nKONTEXT:\n${source}`;
  }
  if (target === "sale_objective") {
    return `Formuliere das Verkaufsziel in etwa 60–110 Wörtern. Stelle Zeitrahmen, Zielrichtung und relevante Rahmenbedingungen klar dar. Fehlende Informationen nicht erfinden.\n\nKONTEXT:\n${source}`;
  }
  if (target === "overall_assessment") {
    return `Formuliere eine fachliche Gesamtbeurteilung in etwa 120–180 Wörtern. Ordne bekannte Chancen, Hemmnisse, Verkaufsaufbereitung und Unsicherheiten abgewogen ein. Keine Verkaufspreisgarantie und keine neuen Zahlen.\n\nKONTEXT:\n${source}`;
  }
  return `Erstelle für das angegebene Verkaufsszenario vier interne Textbausteine. Antworte ausschließlich als valides JSON mit exakt diesen Schlüsseln: {"description":"...","assumptions":"...","internal_assessment":"...","recommendation_rationale":"..."}.
- description: 70–120 Wörter, was dieses Szenario praktisch bedeutet.
- assumptions: 45–90 Wörter, nur vorhandene Annahmen/Unsicherheiten.
- internal_assessment: 70–120 Wörter, Chancen/Risiken und fachliche Einordnung.
- recommendation_rationale: 50–100 Wörter nur wenn das Szenario im Kontext als empfohlen markiert ist; sonst leerer String.
Keine neuen Zahlen erfinden oder vorhandene verändern.\n\nKONTEXT:\n${source}`;
}

export async function generateSalesReadinessAiDraft(input: {
  env: Env;
  viewModel: SalesReadinessViewModel;
  target: SalesReadinessAiTarget;
  scenarioId?: string;
  form?: FormSnapshot;
}) {
  if (input.env.SALES_READINESS_AI_ENABLED !== "true") {
    throw new Error("AI_DISABLED");
  }
  const apiKey = input.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("AI_NOT_CONFIGURED");
  }
  const model = input.env.SALES_READINESS_AI_MODEL || "gpt-5.6-terra";
  const context = buildContext(input.viewModel, input.form, input.scenarioId);
  if (input.target === "scenario" && !scenarioContext(input.viewModel, input.scenarioId)) {
    throw new Error("SCENARIO_NOT_FOUND");
  }

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      instructions: SYSTEM_INSTRUCTIONS,
      input: promptFor(input.target, context),
      reasoning: { effort: "low" },
      max_output_tokens: input.target === "scenario" ? 1100 : 700,
      store: false,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    console.error("sales-readiness-ai OpenAI error", response.status, body.slice(0, 600));
    throw new Error(`AI_PROVIDER_${response.status}`);
  }

  const payload = await response.json();
  const output = extractOutputText(payload);
  if (!output) throw new Error("AI_EMPTY_RESPONSE");

  if (input.target === "scenario") {
    const parsed = parseJsonText(output) as Record<string, unknown>;
    return {
      description: clean(parsed.description, 3000),
      assumptions: clean(parsed.assumptions, 3000),
      internal_assessment: clean(parsed.internal_assessment, 3000),
      recommendation_rationale: clean(parsed.recommendation_rationale, 3000),
    };
  }

  return { [input.target]: clean(output, 5000) };
}