export type SalesReadinessStatus = "DRAFT" | "READY_FOR_REVIEW" | "FINALIZED";
export type SalesReadinessConfidence = "LOW" | "MEDIUM" | "HIGH";
export type SalesReadinessDecision = "RECOMMENDED" | "OPTIONAL" | "NOT_RECOMMENDED" | "OPEN";
export type SalesReadinessMeasureStatus = "OPEN" | "PLANNED" | "COMMISSIONED" | "DONE" | "DISMISSED";

export interface SalesReadinessScenarioViewModel {
  id: string;
  kind: "AS_IS" | "RECOMMENDED_PREPARATION" | "EXTENDED_MEASURES";
  title: string;
  description: string;
  assumptions: string;
  confidence: SalesReadinessConfidence;
  investmentMin: number | null;
  investmentMax: number | null;
  estimatedSalePriceMin: number | null;
  estimatedSalePriceMax: number | null;
  durationWeeksMin: number | null;
  durationWeeksMax: number | null;
  recommended: boolean;
}
export interface SalesReadinessMeasureViewModel {
  id: string;
  category: string;
  title: string;
  description: string;
  decision: SalesReadinessDecision;
  rationale: string;
  costMin: number | null;
  costMax: number | null;
  responsibleParty: string;
  partnerCompany: string | null;
  targetDate: string | null;
  status: SalesReadinessMeasureStatus;
  sortOrder: number;
  selectedForTasks: boolean;
}

export interface SalesReadinessViewModel {
  lead: {
    id: string;
    number: string;
    contactLabel: string;
    propertyLabel: string;
  };
  check: {
    id: string | null;
    status: SalesReadinessStatus;
    inspectionAt: string | null;
    startingSituation: string;
    saleObjective: string;
    desiredTimeframe: string;
    overallAssessment: string;
    assumptionsAndUncertainties: string;
    responsibleUserLabel: string;
    version: number;
  };
  scenarios: SalesReadinessScenarioViewModel[];
  measures: SalesReadinessMeasureViewModel[];
}

export const SALES_READINESS_STATUS_LABELS: Record<SalesReadinessStatus, string> = {
  DRAFT: "Entwurf",
  READY_FOR_REVIEW: "Prüfbereit",
  FINALIZED: "Finalisiert",
};

export const CONFIDENCE_LABELS: Record<SalesReadinessConfidence, string> = {
  LOW: "Gering",
  MEDIUM: "Mittel",
  HIGH: "Hoch",
};

export const DECISION_LABELS: Record<SalesReadinessDecision, string> = {
  RECOMMENDED: "Empfohlen",
  OPTIONAL: "Optional",
  NOT_RECOMMENDED: "Nicht empfohlen",
  OPEN: "Offen",
};

export const MEASURE_STATUS_LABELS: Record<SalesReadinessMeasureStatus, string> = {
  OPEN: "Offen",
  PLANNED: "Geplant",
  COMMISSIONED: "Beauftragt",
  DONE: "Erledigt",
  DISMISSED: "Verworfen",
};

export function emptySalesReadinessViewModel(input: {
  leadId: string;
  leadNumber: string;
  contactLabel: string;
  propertyLabel: string;
  responsibleUserLabel: string;
}): SalesReadinessViewModel {
  const scenario = (
    kind: SalesReadinessScenarioViewModel["kind"],
    title: string,
  ): SalesReadinessScenarioViewModel => ({
    id: `prepared-${kind.toLowerCase()}`,
    kind,
    title,
    description: "Wird nach Besichtigung und fachlicher Bewertung ausgearbeitet.",
    assumptions: "Noch keine Annahmen dokumentiert.",
    confidence: "LOW",
    investmentMin: null,
    investmentMax: null,
    estimatedSalePriceMin: null,
    estimatedSalePriceMax: null,
    durationWeeksMin: null,
    durationWeeksMax: null,
    recommended: false,
  });

  return {
    lead: {
      id: input.leadId,
      number: input.leadNumber,
      contactLabel: input.contactLabel,
      propertyLabel: input.propertyLabel,
    },
    check: {
      id: null,
      status: "DRAFT",
      inspectionAt: null,
      startingSituation: "Noch nicht erfasst",
      saleObjective: "Noch nicht erfasst",
      desiredTimeframe: "Noch nicht erfasst",
      overallAssessment: "Der Verkaufsfertig-Check ist für diesen Lead vorbereitet, aber noch nicht aktiviert.",
      assumptionsAndUncertainties: "Die Datenbankmigration wurde noch nicht angewendet. Es werden keine Check-Daten geladen oder gespeichert.",
      responsibleUserLabel: input.responsibleUserLabel,
      version: 1,
    },
    scenarios: [
      scenario("AS_IS", "Verkauf im Ist-Zustand"),
      scenario("RECOMMENDED_PREPARATION", "Empfohlene Verkaufsaufbereitung"),
      scenario("EXTENDED_MEASURES", "Erweiterte Maßnahmen"),
    ],
    measures: [],
  };
}
