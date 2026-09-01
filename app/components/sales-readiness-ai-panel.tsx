import { useState } from "react";

interface ScenarioOption {
  id: string;
  kind: "AS_IS" | "RECOMMENDED_PREPARATION" | "EXTENDED_MEASURES";
  title: string;
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

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const prototype = element instanceof HTMLTextAreaElement
    ? HTMLTextAreaElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
  setter?.call(element, value);
  element.dispatchEvent(new Event("input", { bubbles: true }));
  element.dispatchEvent(new Event("change", { bubbles: true }));
}

function applyBasicField(name: string, value: string) {
  const element = document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`.readiness-workspace [name="${name}"]`);
  if (element) setNativeValue(element, value);
}

function applyScenarioFields(scenarioId: string, fields: Record<string, string>) {
  const form = scenarioForm(scenarioId);
  if (!form) return;
  for (const [name, value] of Object.entries(fields)) {
    const element = form.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[name="${name}"]`);
    if (element) setNativeValue(element, value);
  }
}

export function SalesReadinessAiPanel({
  leadId,
  scenarios,
  canWrite,
  configured,
}: {
  leadId: string;
  scenarios: ScenarioOption[];
  canWrite: boolean;
  configured: boolean;
}) {
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function generate(
    target: "starting_situation" | "sale_objective" | "overall_assessment" | "scenario",
    scenarioId?: string,
  ) {
    const key = scenarioId ? `scenario:${scenarioId}` : target;
    setLoading(key);
    setMessage(null);
    setError(null);
    try {
      const form = target === "scenario" && scenarioId
        ? { ...basicSnapshot(), ...scenarioSnapshot(scenarioId) }
        : basicSnapshot();
      const response = await fetch("/api/sales-readiness-ai", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ leadId, target, scenarioId, form }),
      });
      const result = await response.json() as {
        ok?: boolean;
        error?: string;
        fields?: Record<string, string>;
      };
      if (!response.ok || !result.ok || !result.fields) {
        throw new Error(result.error || "KI-Entwurf konnte nicht erstellt werden.");
      }
      if (target === "scenario" && scenarioId) {
        applyScenarioFields(scenarioId, result.fields);
      } else {
        const value = result.fields[target];
        if (value) applyBasicField(target, value);
      }
      setMessage("KI-Entwurf eingefügt. Bitte fachlich prüfen und anschließend normal speichern.");
    } catch (err: any) {
      setError(String(err?.message ?? "KI-Entwurf konnte nicht erstellt werden."));
    } finally {
      setLoading(null);
    }
  }

  if (!canWrite) return null;

  return (
    <section className="data-card readiness-ai-card" aria-labelledby="readiness-ai-title">
      <div className="card-head readiness-ai-head">
        <div>
          <p className="eyebrow">KI-Bausteine</p>
          <h2 id="readiness-ai-title">Mit ChatGPT formulieren</h2>
          <p className="lead-card-caption">
            Erstellt ausschließlich Textentwürfe aus dem vorhandenen Check. Preise, Status, Eigentümerentscheidung und Finalisierung bleiben unverändert.
          </p>
        </div>
        <span className="readiness-ai-badge">ChatGPT</span>
      </div>

      {!configured ? (
        <div className="form-warning readiness-ai-warning">
          Die KI-Funktion ist eingebaut, aber der OpenAI API-Key ist in BETA noch nicht verbunden.
        </div>
      ) : null}

      <div className="readiness-ai-groups">
        <div className="readiness-ai-group">
          <strong>Check-Grunddaten</strong>
          <div className="readiness-ai-actions">
            <button className="secondary-button" type="button" disabled={!configured || Boolean(loading)} onClick={() => generate("starting_situation")}>
              {loading === "starting_situation" ? "Formuliert …" : "Ausgangslage formulieren"}
            </button>
            <button className="secondary-button" type="button" disabled={!configured || Boolean(loading)} onClick={() => generate("sale_objective")}>
              {loading === "sale_objective" ? "Formuliert …" : "Verkaufsziel formulieren"}
            </button>
            <button className="secondary-button" type="button" disabled={!configured || Boolean(loading)} onClick={() => generate("overall_assessment")}>
              {loading === "overall_assessment" ? "Formuliert …" : "Gesamtbeurteilung formulieren"}
            </button>
          </div>
        </div>

        {scenarios.length ? (
          <div className="readiness-ai-group">
            <strong>Verkaufsszenarien</strong>
            <div className="readiness-ai-actions">
              {scenarios.map((scenario) => {
                const key = `scenario:${scenario.id}`;
                return (
                  <button
                    className="secondary-button"
                    type="button"
                    key={scenario.id}
                    disabled={!configured || Boolean(loading)}
                    onClick={() => generate("scenario", scenario.id)}
                    title={scenario.title}
                  >
                    {loading === key ? "Formuliert …" : KIND_LABELS[scenario.kind]}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {message ? <div className="form-success readiness-ai-feedback">{message}</div> : null}
      {error ? <div className="form-error readiness-ai-feedback">{error}</div> : null}
      <small className="readiness-ai-note">
        Die erzeugten Texte werden nicht automatisch gespeichert. Vor dem Speichern immer fachlich prüfen. Für die Textgenerierung werden nur die für den Check benötigten Objekt- und Check-Inhalte an OpenAI übertragen; Kontaktnamen werden nicht an den KI-Prompt übergeben.
      </small>
    </section>
  );
}
