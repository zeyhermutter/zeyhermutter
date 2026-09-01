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

const BASE_INSTRUCTIONS = `Du unterstützt mich bei einem internen Verkaufsfertig-Check für eine Immobilie.

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
