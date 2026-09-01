import { useState } from "react";

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

const KIND_LABELS: Record<ScenarioOption["kind"], string> = {
  AS_IS: "Szenario A · Ist-Zustand",
  RECOMMENDED_PREPARATION: "Szenario B · Aufbereitung",
  EXTENDED_MEASURES: "Szenario C · größere Maßnahmen",
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

function promptForBasic(target: "starting_situation" | "sale_objective" | "overall_assessment") {
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

export function SalesReadinessAiPanel(props: SalesReadinessPromptPanelProps) {
  const [preview, setPreview] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!props.canWrite) return null;

  async function prepare(label: string, prompt: string) {
    setPreview(prompt);
    setMessage(null);
    setError(null);
    try {
      await copyText(prompt);
      setMessage(`${label} kopiert. Jetzt im ChatGPT-Browser einfügen.`);
    } catch {
      setError("Automatisches Kopieren war nicht möglich. Der Textbaustein steht unten zum manuellen Kopieren bereit.");
    }
  }

  return (
    <section className="data-card readiness-ai-card" aria-labelledby="readiness-ai-title">
      <div className="card-head readiness-ai-head">
        <div>
          <p className="eyebrow">ChatGPT-Textbausteine</p>
          <h2 id="readiness-ai-title">Prompt kopieren und in ChatGPT einfügen</h2>
          <p className="lead-card-caption">
            Die Bausteine übernehmen die aktuell sichtbaren Check-Eingaben und geben ChatGPT klare Regeln für die Formulierung. Es wird nichts automatisch gespeichert oder an eine API übertragen.
          </p>
        </div>
        <span className="readiness-ai-badge">Kopieren</span>
      </div>

      <div className="readiness-ai-groups">
        <div className="readiness-ai-group">
          <strong>Check-Grunddaten</strong>
          <div className="readiness-ai-actions">
            <button className="secondary-button" type="button" onClick={() => prepare("Ausgangslage-Prompt", promptForBasic("starting_situation"))}>
              Ausgangslage kopieren
            </button>
            <button className="secondary-button" type="button" onClick={() => prepare("Verkaufsziel-Prompt", promptForBasic("sale_objective"))}>
              Verkaufsziel kopieren
            </button>
            <button className="secondary-button" type="button" onClick={() => prepare("Gesamtbeurteilung-Prompt", promptForBasic("overall_assessment"))}>
              Gesamtbeurteilung kopieren
            </button>
          </div>
        </div>

        {props.scenarios.length ? (
          <div className="readiness-ai-group">
            <strong>Verkaufsszenarien</strong>
            <div className="readiness-ai-actions">
              {props.scenarios.map((scenario) => (
                <button
                  className="secondary-button"
                  type="button"
                  key={scenario.id}
                  onClick={() => prepare(`${KIND_LABELS[scenario.kind]}-Prompt`, promptForScenario(scenario))}
                  title={scenario.title}
                >
                  {KIND_LABELS[scenario.kind]} kopieren
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {message ? <div className="form-success readiness-ai-feedback">{message}</div> : null}
      {error ? <div className="form-error readiness-ai-feedback">{error}</div> : null}

      {preview ? (
        <div className="readiness-ai-preview-wrap">
          <div className="readiness-ai-preview-head">
            <strong>Zuletzt erzeugter Textbaustein</strong>
            <button className="secondary-button" type="button" onClick={() => prepare("Textbaustein", preview)}>
              Erneut kopieren
            </button>
          </div>
          <textarea className="readiness-ai-preview" readOnly value={preview} rows={12} aria-label="ChatGPT-Textbaustein" />
        </div>
      ) : null}

      <small className="readiness-ai-note">
        Erst beim Einfügen in ChatGPT verlässt der Text deinen Browser. Prüfe vor dem Einfügen, ob du alle enthaltenen CRM-Angaben wirklich mitsenden möchtest. Die Antwort anschließend fachlich prüfen und manuell in die passenden CRM-Felder übernehmen.
      </small>
    </section>
  );
}
