import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface ScenarioOption {
  id: string;
  kind: "AS_IS" | "RECOMMENDED_PREPARATION" | "EXTENDED_MEASURES";
  title: string;
}

interface SalesReadinessPromptPanelProps {
  leadId: string;
  scenarios: ScenarioOption[];
  canWrite: boolean;
  configured: boolean;
}

type BasicTarget = "starting_situation" | "sale_objective" | "overall_assessment";

type PromptMount =
  | { id: string; element: HTMLElement; target: BasicTarget; scenario?: never }
  | { id: string; element: HTMLElement; target: "scenario"; scenario: ScenarioOption };

const KIND_LABELS: Record<ScenarioOption["kind"], string> = {
  AS_IS: "Szenario A · Ist-Zustand",
  RECOMMENDED_PREPARATION: "Szenario B · Aufbereitung",
  EXTENDED_MEASURES: "Szenario C · größere Maßnahmen",
};

const BASIC_TARGETS: Array<{ target: BasicTarget; fieldName: string }> = [
  { target: "starting_situation", fieldName: "starting_situation" },
  { target: "sale_objective", fieldName: "sale_objective" },
  { target: "overall_assessment", fieldName: "overall_assessment" },
];

const BASIC_PLACEHOLDERS: Record<string, string> = {
  starting_situation:
    "Beispiel: Die Immobilie wird derzeit im bestehenden Zustand betrachtet. Vor dem Vermarktungsstart sollen Zustand, vorhandene Unterlagen und mögliche verkaufshemmende Punkte strukturiert eingeordnet werden. Bekannte Rahmenbedingungen und der Anlass des Verkaufs werden hier neutral festgehalten.",
  sale_objective:
    "Beispiel: Ziel ist ein geordneter Verkauf mit einer nachvollziehbaren Positionierung der Immobilie. Dabei sollen notwendige Vorbereitungen, verfügbarer Zeitrahmen und die bekannten Vorstellungen der Eigentümer berücksichtigt werden.",
  overall_assessment:
    "Beispiel: Die Immobilie ist grundsätzlich vermarktbar. Vor dem Marktstart sollte geprüft werden, welche Maßnahmen die Präsentation sinnvoll verbessern und welche Aufwände wirtschaftlich nicht erforderlich erscheinen. Offene Punkte und Unsicherheiten werden separat dokumentiert.",
  assumptions_and_uncertainties:
    "Beispiel: Noch offen sind einzelne Angaben zum Zustand, zu möglichen Kosten und zum zeitlichen Aufwand. Aussagen zu Wirkung, Verkaufspreis oder Dauer sind daher nur im Rahmen der bereits vorliegenden Informationen möglich.",
};

const SCENARIO_PLACEHOLDERS: Record<ScenarioOption["kind"], Record<string, string>> = {
  AS_IS: {
    description:
      "Beispiel: Die Immobilie wird ohne zusätzliche Aufbereitungsmaßnahmen im aktuellen Zustand für die Vermarktung vorbereitet. Vorhandene Eigenschaften und erkennbare Einschränkungen werden transparent in Positionierung und Präsentation berücksichtigt.",
    assumptions:
      "Beispiel: Grundlage ist der aktuell dokumentierte Zustand. Zusätzliche Investitionen oder Arbeiten vor Vermarktungsbeginn werden in diesem Szenario nicht vorausgesetzt.",
    internal_assessment:
      "Beispiel: Das Szenario reduziert vorbereitenden Aufwand und zusätzliche Kosten. Gleichzeitig ist zu berücksichtigen, dass vorhandene optische oder funktionale Einschränkungen die Wahrnehmung durch Interessenten beeinflussen können.",
    recommendation_rationale:
      "Beispiel: Dieses Szenario ist sinnvoll, wenn zusätzliche Maßnahmen nach fachlicher Abwägung keinen ausreichenden Mehrwert für Vermarktung, Zeit oder wirtschaftliches Ergebnis erwarten lassen.",
  },
  RECOMMENDED_PREPARATION: {
    description:
      "Beispiel: Vor dem Marktstart werden gezielte, überschaubare Maßnahmen umgesetzt, die Präsentation und Wahrnehmung der Immobilie verbessern sollen. Der Schwerpunkt liegt auf einer wirtschaftlich angemessenen Verkaufsaufbereitung.",
    assumptions:
      "Beispiel: Es wird davon ausgegangen, dass die vorgesehenen Maßnahmen im dokumentierten Umfang umgesetzt werden können. Kosten, Verfügbarkeit von Dienstleistern und tatsächliche Wirkung bleiben bis zur konkreten Klärung teilweise offen.",
    internal_assessment:
      "Beispiel: Das Szenario verbindet begrenzten Vorbereitungsaufwand mit einer verbesserten Ausgangslage für die Vermarktung. Entscheidend ist, dass Kosten und zeitlicher Aufwand in einem angemessenen Verhältnis zum erwarteten Nutzen bleiben.",
    recommendation_rationale:
      "Beispiel: Die gezielte Aufbereitung wird empfohlen, wenn die vorgesehenen Maßnahmen mit überschaubarem Aufwand erkennbare Schwächen in Präsentation oder Verkaufsbereitschaft reduzieren können.",
  },
  EXTENDED_MEASURES: {
    description:
      "Beispiel: Vor der Vermarktung werden umfangreichere Maßnahmen betrachtet, die über eine reine Verkaufsaufbereitung hinausgehen. Dieses Szenario erfordert eine gesonderte Abwägung von Investition, Zeitbedarf und möglicher Wirkung.",
    assumptions:
      "Beispiel: Umfang, Kosten, Ausführungsdauer und tatsächliche Wirkung der Maßnahmen müssen belastbar geklärt werden. Ohne konkrete Angebote oder Planungen bleiben diese Punkte mit Unsicherheiten verbunden.",
    internal_assessment:
      "Beispiel: Umfangreichere Maßnahmen können die Marktposition verändern, erhöhen jedoch Kosten, organisatorischen Aufwand und Zeit bis zum Vermarktungsstart. Der mögliche Zusatznutzen ist deshalb besonders kritisch zu prüfen.",
    recommendation_rationale:
      "Beispiel: Dieses Szenario kommt nur dann als Empfehlung in Betracht, wenn der erwartete zusätzliche Nutzen die höheren Kosten, Risiken und den längeren Vorbereitungszeitraum fachlich rechtfertigt.",
  },
};

const MEASURE_PLACEHOLDERS: Record<string, string> = {
  description:
    "Beispiel: Umfang und Ziel der Maßnahme konkret beschreiben, z. B. welche Bereiche betroffen sind und was vor dem Vermarktungsstart erreicht werden soll.",
  rationale:
    "Beispiel: Fachlich begründen, warum die Maßnahme empfohlen, nicht empfohlen oder als nicht erforderlich eingeordnet wird.",
};

function fieldValue(root: ParentNode, name: string) {
  const element = root.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(`[name="${name}"]`);
  if (!element) return "";
  if (element instanceof HTMLInputElement && element.type === "checkbox") return element.checked;
  return element.value;
}

function basicSnapshot() {
  const root = document.querySelector(".readiness-workspace") ?? document;
  return {
    inspection_date: fieldValue(root, "inspection_date"),
    desired_timeframe: fieldValue(root, "desired_timeframe"),
    starting_situation: fieldValue(root, "starting_situation"),
    sale_objective: fieldValue(root, "sale_objective"),
    overall_assessment: fieldValue(root, "overall_assessment"),
    assumptions_and_uncertainties: fieldValue(root, "assumptions_and_uncertainties"),
  };
}

function scenarioForm(scenarioId: string) {
  const idInput = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="scenario_id"]'))
    .find((input) => input.value === scenarioId);
  return idInput?.closest("form") ?? null;
}

function scenarioSnapshot(scenarioId: string) {
  const form = scenarioForm(scenarioId);
  if (!form) return {};
  return {
    title: fieldValue(form, "title"),
    description: fieldValue(form, "description"),
    assumptions: fieldValue(form, "assumptions"),
    internal_assessment: fieldValue(form, "internal_assessment"),
    recommendation_rationale: fieldValue(form, "recommendation_rationale"),
    confidence: fieldValue(form, "confidence"),
    investment_min: fieldValue(form, "investment_min"),
    investment_max: fieldValue(form, "investment_max"),
    estimated_sale_price_min: fieldValue(form, "estimated_sale_price_min"),
    estimated_sale_price_max: fieldValue(form, "estimated_sale_price_max"),
    duration_weeks_min: fieldValue(form, "duration_weeks_min"),
    duration_weeks_max: fieldValue(form, "duration_weeks_max"),
    is_recommended: fieldValue(form, "is_recommended"),
  };
}

function measureSnapshots() {
  return Array.from(document.querySelectorAll<HTMLInputElement>('input[name="measure_id"]'))
    .map((input) => input.closest("form"))
    .filter((form): form is HTMLFormElement => Boolean(form))
    .slice(0, 20)
    .map((form) => ({
      title: fieldValue(form, "title"),
      category: fieldValue(form, "category"),
      description: fieldValue(form, "description"),
      decision: fieldValue(form, "decision"),
      rationale: fieldValue(form, "rationale"),
      cost_min: fieldValue(form, "cost_min"),
      cost_max: fieldValue(form, "cost_max"),
      status: fieldValue(form, "status"),
    }))
    .filter((measure) => Object.values(measure).some((value) => Boolean(value)));
}

function compact(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(compact).filter((item) => item !== undefined);
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== "" && item !== null && item !== undefined && item !== false)
      .map(([key, item]) => [key, compact(item)] as const)
      .filter(([, item]) => item !== undefined);
    return Object.fromEntries(entries);
  }
  return value;
}

const BASE_INSTRUCTIONS = `Du unterstützt mich bei einem internen Verkaufsstrategie-Check für eine Immobilie.

Verbindliche Regeln:
- Formuliere professionelles, klares Deutsch ohne Werbeübertreibung.
- Nutze ausschließlich die unten gelieferten Informationen.
- Erfinde keine Fakten, Mängel, Eigentümerwünsche, Termine, Preise, Kosten, Dauern oder sonstigen Zahlen.
- Wenn Informationen fehlen oder unsicher sind, benenne das sachlich.
- Triff keine Eigentümerentscheidung und setze keinen Workflow-Status.
- Keine Rechts-, Steuer- oder Garantieaussagen.
- Bestehende Zahlen dürfen sprachlich eingeordnet, aber nicht verändert werden.
- Antworte nur mit dem angeforderten Textbaustein, ohne Vorrede.`;

function promptForBasic(target: BasicTarget) {
  const context = compact({
    check: basicSnapshot(),
    measures: measureSnapshots(),
  });
  const task = target === "starting_situation"
    ? "Formuliere die Ausgangssituation in etwa 90–150 Wörtern. Beschreibe Ist-Zustand, Anlass und bekannte Rahmenbedingungen neutral und konkret. Nimm keine Empfehlung vorweg."
    : target === "sale_objective"
      ? "Formuliere das Verkaufsziel in etwa 60–110 Wörtern. Stelle Zielrichtung, bekannten Zeitrahmen und relevante Rahmenbedingungen klar dar."
      : "Formuliere eine fachliche Gesamtbeurteilung in etwa 120–180 Wörtern. Ordne bekannte Chancen, Hemmnisse, sinnvolle Verkaufsaufbereitung und Unsicherheiten ausgewogen ein.";

  return `${BASE_INSTRUCTIONS}\n\nAUFGABE:\n${task}\n\nVORHANDENE CHECK-DATEN:\n${JSON.stringify(context, null, 2)}`;
}

function promptForScenario(scenario: ScenarioOption) {
  const context = compact({
    check: basicSnapshot(),
    scenario: {
      kind: scenario.kind,
      ...scenarioSnapshot(scenario.id),
    },
    measures: measureSnapshots(),
  });

  return `${BASE_INSTRUCTIONS}\n\nAUFGABE:\nFormuliere für ${KIND_LABELS[scenario.kind]} vier Textbausteine:\n1. Beschreibung: 70–120 Wörter – was dieses Szenario praktisch bedeutet.\n2. Annahmen und Unsicherheiten: 45–90 Wörter – nur auf Basis der vorhandenen Angaben.\n3. Interne Bewertung: 70–120 Wörter – Chancen, Risiken und fachliche Einordnung.\n4. Empfehlungsbegründung: 50–100 Wörter nur dann, wenn das Szenario in den Daten als empfohlen markiert ist; sonst schreibe lediglich \"Nicht als Empfehlung markiert.\"\n\nStrukturiere die Antwort mit genau den Überschriften \"Beschreibung\", \"Annahmen und Unsicherheiten\", \"Interne Bewertung\" und \"Empfehlungsbegründung\".\n\nVORHANDENE CHECK-DATEN:\n${JSON.stringify(context, null, 2)}`;
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  document.execCommand("copy");
  textarea.remove();
}

function applyExamplePlaceholders(scenarios: ScenarioOption[]) {
  const root = document.querySelector(".readiness-workspace");
  if (!root) return;

  for (const [name, placeholder] of Object.entries(BASIC_PLACEHOLDERS)) {
    const field = root.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
    if (field && !field.placeholder) field.placeholder = placeholder;
  }

  for (const scenario of scenarios) {
    const form = scenarioForm(scenario.id);
    if (!form) continue;
    const placeholders = SCENARIO_PLACEHOLDERS[scenario.kind];
    for (const [name, placeholder] of Object.entries(placeholders)) {
      const field = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
      if (field && !field.placeholder) field.placeholder = placeholder;
    }
  }

  const measureForms = Array.from(root.querySelectorAll<HTMLInputElement>('input[name="measure_id"]'))
    .map((input) => input.closest("form"))
    .filter((form): form is HTMLFormElement => Boolean(form));

  for (const form of measureForms) {
    for (const [name, placeholder] of Object.entries(MEASURE_PLACEHOLDERS)) {
      const field = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
      if (field && !field.placeholder) field.placeholder = placeholder;
    }
  }
}

function PromptCopyButton({ target, scenario }: { target: BasicTarget | "scenario"; scenario?: ScenarioOption }) {
  const [state, setState] = useState<"idle" | "copied" | "error">("idle");

  async function handleCopy() {
    const prompt = target === "scenario" && scenario
      ? promptForScenario(scenario)
      : promptForBasic(target as BasicTarget);

    try {
      await copyText(prompt);
      setState("copied");
      window.setTimeout(() => setState("idle"), 2200);
    } catch {
      setState("error");
      window.setTimeout(() => setState("idle"), 3000);
    }
  }

  return (
    <span className="readiness-inline-prompt-control">
      <button
        className="secondary-button readiness-inline-prompt-button"
        type="button"
        onClick={handleCopy}
        title="Aktuelle Check-Daten als vorbereiteten Prompt in die Zwischenablage kopieren"
      >
        {state === "copied" ? "Kopiert ✓" : state === "error" ? "Kopieren fehlgeschlagen" : "ChatGPT-Prompt kopieren"}
      </button>
      <span className="sr-only" aria-live="polite">
        {state === "copied" ? "ChatGPT-Prompt wurde kopiert." : state === "error" ? "Prompt konnte nicht kopiert werden." : ""}
      </span>
    </span>
  );
}

export function SalesReadinessAiPanel(props: SalesReadinessPromptPanelProps) {
  const [mounts, setMounts] = useState<PromptMount[]>([]);

  useEffect(() => {
    if (!props.canWrite) {
      setMounts([]);
      return;
    }

    applyExamplePlaceholders(props.scenarios);

    const created: HTMLElement[] = [];
    const next: PromptMount[] = [];

    for (const { target, fieldName } of BASIC_TARGETS) {
      const field = document.querySelector<HTMLElement>(`.readiness-workspace [name="${fieldName}"]`);
      const label = field?.closest("label");
      if (!field || !label) continue;

      const mount = document.createElement("span");
      mount.className = "readiness-inline-prompt-mount";
      mount.dataset.readinessPromptMount = target;
      label.insertBefore(mount, field);
      created.push(mount);
      next.push({ id: `basic:${target}`, element: mount, target });
    }

    for (const scenario of props.scenarios) {
      const form = scenarioForm(scenario.id);
      const head = form?.querySelector<HTMLElement>(".readiness-scenario-head");
      if (!head) continue;

      const mount = document.createElement("span");
      mount.className = "readiness-scenario-prompt-mount";
      mount.dataset.readinessPromptMount = `scenario:${scenario.id}`;
      head.appendChild(mount);
      created.push(mount);
      next.push({ id: `scenario:${scenario.id}`, element: mount, target: "scenario", scenario });
    }

    setMounts(next);

    return () => {
      for (const element of created) element.remove();
    };
  }, [props.canWrite, props.scenarios]);

  if (!props.canWrite) return null;

  return (
    <>
      {mounts.map((mount) => createPortal(
        mount.target === "scenario"
          ? <PromptCopyButton target="scenario" scenario={mount.scenario} />
          : <PromptCopyButton target={mount.target} />,
        mount.element,
        mount.id,
      ))}
    </>
  );
}
