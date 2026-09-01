export type SalesReadinessStatus = "DRAFT" | "READY_FOR_REVIEW" | "FINALIZED";
export type SalesReadinessConfidence = "LOW" | "MEDIUM" | "HIGH";
export type SalesReadinessDecision =
  | "URGENTLY_RECOMMENDED"
  | "RECOMMENDED"
  | "OPTIONAL"
  | "NOT_RECOMMENDED"
  | "NOT_REQUIRED"
  | "OPEN";
export type SalesReadinessOwnerDecision =
  | "OPEN"
  | "AS_IS_SALE"
  | "RECOMMENDED_PREPARATION"
  | "EXTENDED_RENOVATION"
  | "INDIVIDUAL_MEASURES"
  | "POSTPONED"
  | "NO_SALE";
export type SalesReadinessMeasureStatus =
  | "PROPOSED"
  | "QUOTE_REQUIRED"
  | "QUOTE_REQUESTED"
  | "QUOTE_RECEIVED"
  | "WAITING_OWNER"
  | "APPROVED"
  | "COMMISSIONED"
  | "PLANNED"
  | "IN_PROGRESS"
  | "BLOCKED"
  | "DONE"
  | "CHECKED"
  | "DISMISSED";
export type SalesReadinessOwnerApprovalStatus =
  | "NOT_REQUESTED"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "NOT_REQUIRED";

export interface SalesReadinessScenarioViewModel {
  id: string;
  kind: "AS_IS" | "RECOMMENDED_PREPARATION" | "EXTENDED_MEASURES";
  title: string;
  description: string;
  assumptions: string;
  internalAssessment: string;
  recommendationRationale: string;
  confidence: SalesReadinessConfidence;
  investmentMin: number | null;
  investmentMax: number | null;
  estimatedSalePriceMin: number | null;
  estimatedSalePriceMax: number | null;
  durationWeeksMin: number | null;
  durationWeeksMax: number | null;
  recommended: boolean;
  estimatedUpliftMin: number | null;
  estimatedUpliftMax: number | null;
  economicAdvantageMin: number | null;
  economicAdvantageMax: number | null;
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
  quotePrice: number | null;
  approvedBudget: number | null;
  actualCost: number | null;
  responsibleParty: string;
  partnerCompany: string | null;
  targetDate: string | null;
  status: SalesReadinessMeasureStatus;
  ownerApprovalStatus: SalesReadinessOwnerApprovalStatus;
  ownerApprovalAt: string | null;
  plannedStartDate: string | null;
  plannedEndDate: string | null;
  completedAt: string | null;
  sortOrder: number;
  selectedForTasks: boolean;
}

export interface SalesReadinessViewModel {
  lead: { id: string; number: string; contactLabel: string; propertyLabel: string };
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
    ownerDecision: SalesReadinessOwnerDecision;
    ownerDecisionAt: string | null;
    ownerDecisionBy: string;
    ownerDecisionNote: string;
    version: number;
  };
  scenarios: SalesReadinessScenarioViewModel[];
  measures: SalesReadinessMeasureViewModel[];
  workflow: {
    reviewable: boolean;
    finalizable: boolean;
    missingForReview: string[];
    nextAction: string;
  };
  summary: {
    estimatedCostMin: number;
    estimatedCostMax: number;
    approvedBudget: number;
    actualCost: number;
  };
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
  URGENTLY_RECOMMENDED: "Dringend empfohlen",
  RECOMMENDED: "Empfohlen",
  OPTIONAL: "Optional",
  NOT_RECOMMENDED: "Nicht empfohlen",
  NOT_REQUIRED: "Nicht erforderlich",
  OPEN: "Offen",
};

export const OWNER_DECISION_LABELS: Record<SalesReadinessOwnerDecision, string> = {
  OPEN: "Noch offen",
  AS_IS_SALE: "Im Ist-Zustand verkaufen",
  RECOMMENDED_PREPARATION: "Optimierte Verkaufsaufbereitung",
  EXTENDED_RENOVATION: "Größere Renovierung",
  INDIVIDUAL_MEASURES: "Einzelne Maßnahmen",
  POSTPONED: "Entscheidung vertagt",
  NO_SALE: "Momentan kein Verkauf",
};

export const MEASURE_STATUS_LABELS: Record<SalesReadinessMeasureStatus, string> = {
  PROPOSED: "Vorgeschlagen",
  QUOTE_REQUIRED: "Angebot erforderlich",
  QUOTE_REQUESTED: "Angebot angefragt",
  QUOTE_RECEIVED: "Angebot erhalten",
  WAITING_OWNER: "Wartet auf Eigentümer",
  APPROVED: "Freigegeben",
  COMMISSIONED: "Beauftragt",
  PLANNED: "Geplant",
  IN_PROGRESS: "In Bearbeitung",
  BLOCKED: "Blockiert",
  DONE: "Erledigt",
  CHECKED: "Geprüft",
  DISMISSED: "Verworfen",
};

export const OWNER_APPROVAL_LABELS: Record<SalesReadinessOwnerApprovalStatus, string> = {
  NOT_REQUESTED: "Noch nicht angefragt",
  PENDING: "Freigabe ausstehend",
  APPROVED: "Freigegeben",
  REJECTED: "Abgelehnt",
  NOT_REQUIRED: "Nicht erforderlich",
};

export function emptySalesReadinessViewModel(input: {
  leadId: string;
  leadNumber: string;
  contactLabel: string;
  propertyLabel: string;
  responsibleUserLabel: string;
}): SalesReadinessViewModel {
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
      startingSituation: "",
      saleObjective: "",
      desiredTimeframe: "",
      overallAssessment: "",
      assumptionsAndUncertainties: "",
      responsibleUserLabel: input.responsibleUserLabel,
      ownerDecision: "OPEN",
      ownerDecisionAt: null,
      ownerDecisionBy: "",
      ownerDecisionNote: "",
      version: 1,
    },
    scenarios: [],
    measures: [],
    workflow: {
      reviewable: false,
      finalizable: false,
      missingForReview: ["Verkaufsfertig-Check anlegen"],
      nextAction: "Verkaufsfertig-Check starten",
    },
    summary: {
      estimatedCostMin: 0,
      estimatedCostMax: 0,
      approvedBudget: 0,
      actualCost: 0,
    },
  };
}
