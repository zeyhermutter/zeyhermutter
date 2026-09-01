import { Form } from "react-router";
import type { SalesReadinessViewModel } from "~/lib/sales-readiness";
import {
  CONFIDENCE_LABELS,
  DECISION_LABELS,
  MEASURE_STATUS_LABELS,
  OWNER_APPROVAL_LABELS,
  OWNER_DECISION_LABELS,
  SALES_READINESS_STATUS_LABELS,
} from "~/lib/sales-readiness";

const CATEGORIES = [
  ["CLEARANCE_DISPOSAL", "Entrümpelung & Entsorgung"],
  ["CLEANING", "Reinigung"],
  ["MINOR_REPAIRS", "Kleinere Reparaturen"],
  ["PAINTING", "Malerarbeiten"],
  ["FLOORING_PARQUET", "Boden & Parkett"],
  ["GARDEN_EXTERIOR", "Garten & Außenbereich"],
  ["FURNITURE_STYLING", "Möbel & Styling"],
  ["DOCUMENTS", "Unterlagen"],
  ["ENERGY_CERTIFICATE", "Energieausweis"],
  ["PHOTO_PREPARATION", "Fotovorbereitung"],
  ["OTHER", "Sonstiges"],
] as const;

const SCENARIO_LABELS = {
  AS_IS: "A · Verkauf im Ist-Zustand",
  RECOMMENDED_PREPARATION: "B · Optimierte Verkaufsaufbereitung",
  EXTENDED_MEASURES: "C · Umfangreichere Renovierung",
} as const;

function euro(value: number | null | undefined) {
  return value === null || value === undefined
    ? "—"
    : new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);
}

function inputDate(value: string | null) {
  return value ? value.slice(0, 10) : "";
}

function valueOrBlank(value: number | null) {
  return value ?? "";
}

export function SalesReadinessWorkspace({
  viewModel,
  canWrite,
  canFinalize,
  canTask,
}: {
  viewModel: SalesReadinessViewModel;
  canWrite: boolean;
  canFinalize: boolean;
  canTask: boolean;
}) {
  const check = viewModel.check;
  const checkId = check.id;
  const editable = canWrite && check.status !== "FINALIZED";

  if (!checkId) {
    return (
      <div className="readiness-workspace">
        <section className="readiness-mode-banner preview">
          <strong>BETA-Backend aktiv</strong>
          <span>Noch kein Verkaufsfertig-Check für diesen Lead vorhanden.</span>
        </section>
        <section className="data-card readiness-empty-start">
          <p className="eyebrow">{viewModel.lead.number}</p>
          <h2>{viewModel.lead.propertyLabel}</h2>
          <p>{viewModel.lead.contactLabel} · Verantwortlich: {check.responsibleUserLabel}</p>
          {canWrite ? (
            <Form method="post">
              <button className="primary-button" type="submit" name="_intent" value="create">
                Verkaufsfertig-Check starten
              </button>
            </Form>
          ) : (
            <p className="empty-state">Keine Schreibberechtigung.</p>
          )}
        </section>
      </div>
    );
  }

  return (
    <div className="readiness-workspace">
      <section className="readiness-mode-banner preview" role="status">
        <strong>BETA · Fachlogik aktiv</strong>
        <span>
          Änderungen werden transaktional und versioniert gespeichert. Fachliche Änderungen an einem prüfbereiten Check setzen ihn wieder auf Entwurf.
        </span>
      </section>

      <section className="readiness-overview data-card">
        <div className="readiness-overview-copy">
          <p className="eyebrow">{viewModel.lead.number} · Verkaufsfertig-Check</p>
          <div className="readiness-title-row">
            <h2>{viewModel.lead.propertyLabel}</h2>
            <span className={`readiness-status status-${check.status.toLowerCase()}`}>
              {SALES_READINESS_STATUS_LABELS[check.status]}
            </span>
          </div>
          <p>{viewModel.lead.contactLabel} · Verantwortlich: {check.responsibleUserLabel}</p>
        </div>
        <div className="readiness-actions">
          {check.status === "DRAFT" && canWrite ? (
            <Form method="post">
              <input type="hidden" name="check_id" value={checkId} />
              <input type="hidden" name="version" value={check.version} />
              <button
                className="secondary-button"
                type="submit"
                name="_intent"
                value="ready"
                disabled={!viewModel.workflow.reviewable}
                title={viewModel.workflow.reviewable ? undefined : "Pflichtangaben zuerst vervollständigen"}
              >
                Zur Prüfung markieren
              </button>
            </Form>
          ) : null}
          {check.status === "READY_FOR_REVIEW" && canFinalize ? (
            <Form method="post">
              <input type="hidden" name="check_id" value={checkId} />
              <input type="hidden" name="version" value={check.version} />
              <button
                className="primary-button"
                type="submit"
                name="_intent"
                value="finalize"
                disabled={!viewModel.workflow.finalizable}
                title={viewModel.workflow.finalizable ? undefined : "Eigentümerentscheidung dokumentieren"}
              >
                Finalisieren
              </button>
            </Form>
          ) : null}
          {check.status === "FINALIZED" && canFinalize ? (
            <Form method="post">
              <input type="hidden" name="check_id" value={checkId} />
              <input type="hidden" name="version" value={check.version} />
              <button className="secondary-button" type="submit" name="_intent" value="revision">
                Revision anlegen
              </button>
            </Form>
          ) : null}
        </div>
      </section>

      <section className="data-card readiness-edit-card">
        <div className="card-head">
          <div>
            <p className="eyebrow">Next Best Action</p>
            <h2>{viewModel.workflow.nextAction}</h2>
          </div>
          <span className="readiness-version">Version {check.version}</span>
        </div>
        {check.status === "DRAFT" && viewModel.workflow.missingForReview.length > 0 ? (
          <div className="readiness-disclaimer">
            <strong>Noch offen für Prüfbereitschaft:</strong>
            <ul>
              {viewModel.workflow.missingForReview.slice(0, 6).map((item) => <li key={item}>{item}</li>)}
            </ul>
            {viewModel.workflow.missingForReview.length > 6 ? (
              <span>+ {viewModel.workflow.missingForReview.length - 6} weitere Punkte</span>
            ) : null}
          </div>
        ) : null}
        <div className="readiness-number-grid">
          <div><small>Maßnahmen-Schätzung min.</small><strong>{euro(viewModel.summary.estimatedCostMin)}</strong></div>
          <div><small>Maßnahmen-Schätzung max.</small><strong>{euro(viewModel.summary.estimatedCostMax)}</strong></div>
          <div><small>Freigegebenes Budget</small><strong>{euro(viewModel.summary.approvedBudget)}</strong></div>
          <div><small>Tatsächliche Kosten</small><strong>{euro(viewModel.summary.actualCost)}</strong></div>
        </div>
      </section>

      <Form method="post" className="data-card readiness-edit-card">
        <input type="hidden" name="check_id" value={checkId} />
        <input type="hidden" name="version" value={check.version} />
        <div className="card-head">
          <div><p className="eyebrow">Check-Grunddaten</p><h2>Ausgangslage und Ziel</h2></div>
        </div>
        <div className="readiness-form-grid">
          <label>
            <span>Besichtigung *</span>
            <input name="inspection_date" type="date" defaultValue={inputDate(check.inspectionAt)} disabled={!editable} />
          </label>
          <label>
            <span>Gewünschter Zeitrahmen</span>
            <input name="desired_timeframe" defaultValue={check.desiredTimeframe} disabled={!editable} placeholder="z. B. Vermarktungsstart in 6 Wochen" />
          </label>
          <label className="wide"><span>Ausgangssituation *</span><textarea name="starting_situation" rows={4} defaultValue={check.startingSituation} disabled={!editable} /></label>
          <label className="wide"><span>Verkaufsziel *</span><textarea name="sale_objective" rows={4} defaultValue={check.saleObjective} disabled={!editable} /></label>
          <label className="wide"><span>Gesamtbeurteilung *</span><textarea name="overall_assessment" rows={5} defaultValue={check.overallAssessment} disabled={!editable} /></label>
          <label className="wide"><span>Annahmen und Unsicherheiten *</span><textarea name="assumptions_and_uncertainties" rows={5} defaultValue={check.assumptionsAndUncertainties} disabled={!editable} /></label>
        </div>
        {editable ? (
          <div className="readiness-form-actions">
            <button className="primary-button" type="submit" name="_intent" value="save_check">Grunddaten speichern</button>
          </div>
        ) : null}
      </Form>

      <section className="readiness-section">
        <div className="readiness-section-head">
          <div><p className="eyebrow">Drei Blickwinkel</p><h2>Verkaufsszenarien vergleichen</h2></div>
          <p>Mehrerlös und wirtschaftlicher Vorteil sind konservativ aus den eingetragenen Korridoren abgeleitete Schätzwerte – keine Verkaufspreisgarantie.</p>
        </div>
        <div className="readiness-scenario-grid">
          {viewModel.scenarios.map((scenario) => (
            <Form method="post" className={`readiness-scenario ${scenario.recommended ? "recommended" : ""}`} key={scenario.id}>
              <input type="hidden" name="check_id" value={checkId} />
              <input type="hidden" name="version" value={check.version} />
              <input type="hidden" name="scenario_id" value={scenario.id} />
              <div className="readiness-scenario-head">
                <span>{scenario.recommended ? "Unsere Empfehlung" : "Szenario"}</span>
                <small>{SCENARIO_LABELS[scenario.kind]}</small>
              </div>
              <label><span>Titel *</span><input name="title" defaultValue={scenario.title} disabled={!editable} /></label>
              <label><span>Beschreibung *</span><textarea name="description" rows={3} defaultValue={scenario.description} disabled={!editable} /></label>
              <label><span>Annahmen *</span><textarea name="assumptions" rows={3} defaultValue={scenario.assumptions} disabled={!editable} /></label>
              <label><span>Interne Bewertung *</span><textarea name="internal_assessment" rows={3} defaultValue={scenario.internalAssessment} disabled={!editable} placeholder="Chancen, Risiken und fachliche Einordnung" /></label>
              <label><span>Begründung unserer Empfehlung</span><textarea name="recommendation_rationale" rows={3} defaultValue={scenario.recommendationRationale} disabled={!editable} placeholder="Pflicht, wenn dieses Szenario empfohlen wird" /></label>
              <label>
                <span>Einschätzungssicherheit</span>
                <select name="confidence" defaultValue={scenario.confidence} disabled={!editable}>
                  {Object.entries(CONFIDENCE_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <div className="readiness-number-grid">
                <label><span>Investition min.</span><input name="investment_min" type="number" min="0" step="100" defaultValue={valueOrBlank(scenario.investmentMin)} disabled={!editable} /></label>
                <label><span>Investition max.</span><input name="investment_max" type="number" min="0" step="100" defaultValue={valueOrBlank(scenario.investmentMax)} disabled={!editable} /></label>
                <label><span>Verkaufspreis min. *</span><input name="estimated_sale_price_min" type="number" min="0" step="1000" defaultValue={valueOrBlank(scenario.estimatedSalePriceMin)} disabled={!editable} /></label>
                <label><span>Verkaufspreis max. *</span><input name="estimated_sale_price_max" type="number" min="0" step="1000" defaultValue={valueOrBlank(scenario.estimatedSalePriceMax)} disabled={!editable} /></label>
                <label><span>Dauer min. Wochen *</span><input name="duration_weeks_min" type="number" min="0" step="1" defaultValue={valueOrBlank(scenario.durationWeeksMin)} disabled={!editable} /></label>
                <label><span>Dauer max. Wochen *</span><input name="duration_weeks_max" type="number" min="0" step="1" defaultValue={valueOrBlank(scenario.durationWeeksMax)} disabled={!editable} /></label>
              </div>
              <label className="readiness-recommend">
                <input type="checkbox" name="is_recommended" defaultChecked={scenario.recommended} disabled={!editable} />
                Dieses Szenario fachlich empfehlen
              </label>
              {scenario.kind !== "AS_IS" && scenario.estimatedUpliftMin !== null && scenario.estimatedUpliftMax !== null ? (
                <div className="readiness-calculation">
                  <strong>Schätzwerte gegenüber Ist-Zustand</strong>
                  <span>Geschätzter Mehrerlös: {euro(scenario.estimatedUpliftMin)} bis {euro(scenario.estimatedUpliftMax)}</span>
                  <span>
                    Potenzieller wirtschaftlicher Vorteil: {scenario.economicAdvantageMin === null || scenario.economicAdvantageMax === null
                      ? "Investitionsspanne ergänzen"
                      : `${euro(scenario.economicAdvantageMin)} bis ${euro(scenario.economicAdvantageMax)}`}
                  </span>
                </div>
              ) : null}
              {editable ? (
                <button className="secondary-button" type="submit" name="_intent" value="save_scenario">Szenario speichern</button>
              ) : null}
            </Form>
          ))}
        </div>
        <p className="readiness-disclaimer">
          <strong>Hinweis:</strong> Preis-, Kosten-, Mehrerlös- und Vorteilsspannen sind fachliche Einschätzungen auf Basis der verfügbaren Informationen und keine Garantie. Ein negativer wirtschaftlicher Vorteil ist ausdrücklich zulässig und kann begründen, von einer Investition abzuraten.
        </p>
      </section>

      <section className="data-card readiness-edit-card">
        <div className="card-head">
          <div>
            <p className="eyebrow">Beratungsergebnis</p>
            <h2>Eigentümerentscheidung</h2>
            <p className="lead-card-caption">Die Entscheidung wird niemals automatisch aus unserer Empfehlung abgeleitet.</p>
          </div>
        </div>
        {check.status === "DRAFT" ? (
          <p className="empty-state">Zuerst den fachlich vollständigen Check zur Prüfung markieren. Danach wird die Eigentümerentscheidung dokumentiert.</p>
        ) : check.status === "READY_FOR_REVIEW" && canWrite ? (
          <Form method="post">
            <input type="hidden" name="check_id" value={checkId} />
            <input type="hidden" name="version" value={check.version} />
            <div className="readiness-form-grid">
              <label>
                <span>Entscheidung *</span>
                <select name="owner_decision" defaultValue={check.ownerDecision}>
                  {Object.entries(OWNER_DECISION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                </select>
              </label>
              <label><span>Entscheidungsdatum</span><input name="owner_decision_at" type="date" defaultValue={check.ownerDecisionAt ?? ""} /></label>
              <label className="wide"><span>Entschieden durch *</span><input name="owner_decision_by" defaultValue={check.ownerDecisionBy} placeholder="z. B. Frau Müller / Eigentümergemeinschaft" /></label>
              <label className="wide"><span>Bemerkung</span><textarea name="owner_decision_note" rows={3} defaultValue={check.ownerDecisionNote} /></label>
            </div>
            <div className="readiness-form-actions">
              <button className="primary-button" type="submit" name="_intent" value="owner_decision">Eigentümerentscheidung speichern</button>
            </div>
          </Form>
        ) : (
          <div className="readiness-form-grid compact">
            <div><small>Entscheidung</small><strong>{OWNER_DECISION_LABELS[check.ownerDecision]}</strong></div>
            <div><small>Datum</small><strong>{check.ownerDecisionAt ?? "—"}</strong></div>
            <div><small>Entschieden durch</small><strong>{check.ownerDecisionBy || "—"}</strong></div>
            <div className="wide"><small>Bemerkung</small><p>{check.ownerDecisionNote || "—"}</p></div>
          </div>
        )}
      </section>

      <section className="data-card readiness-measures">
        <div className="card-head">
          <div>
            <p className="eyebrow">Maßnahmen</p>
            <h2>Empfehlungen, Angebote und Umsetzung steuern</h2>
            <p className="lead-card-caption">Maßnahmen bleiben eigenständige Beratungs-/Umsetzungsobjekte. CRM-Aufgaben werden daraus separat und idempotent erzeugt.</p>
          </div>
        </div>

        <div className="readiness-measure-list">
          {viewModel.measures.map((measure) => (
            <Form method="post" className="readiness-measure-editor" key={measure.id}>
              <input type="hidden" name="check_id" value={checkId} />
              <input type="hidden" name="version" value={check.version} />
              <input type="hidden" name="measure_id" value={measure.id} />
              <div className="readiness-form-grid compact">
                <label><span>Kategorie</span><select name="category" defaultValue={measure.category} disabled={!editable}>{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                <label><span>Titel *</span><input name="title" defaultValue={measure.title} disabled={!editable} /></label>
                <label className="wide"><span>Beschreibung</span><textarea name="description" rows={2} defaultValue={measure.description} disabled={!editable} /></label>
                <label><span>Empfehlung *</span><select name="decision" defaultValue={measure.decision} disabled={!editable}>{Object.entries(DECISION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label><span>Status</span><select name="status" defaultValue={measure.status} disabled={!editable}>{Object.entries(MEASURE_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label><span>Kosten-Schätzung min.</span><input name="cost_min" type="number" min="0" step="50" defaultValue={valueOrBlank(measure.costMin)} disabled={!editable} /></label>
                <label><span>Kosten-Schätzung max.</span><input name="cost_max" type="number" min="0" step="50" defaultValue={valueOrBlank(measure.costMax)} disabled={!editable} /></label>
                <label><span>Angebotspreis</span><input name="quote_price" type="number" min="0" step="50" defaultValue={valueOrBlank(measure.quotePrice)} disabled={!editable} /></label>
                <label><span>Freigegebenes Budget</span><input name="approved_budget" type="number" min="0" step="50" defaultValue={valueOrBlank(measure.approvedBudget)} disabled={!editable} /></label>
                <label><span>Tatsächliche Kosten</span><input name="actual_cost" type="number" min="0" step="50" defaultValue={valueOrBlank(measure.actualCost)} disabled={!editable} /></label>
                <label><span>Eigentümerfreigabe</span><select name="owner_approval_status" defaultValue={measure.ownerApprovalStatus} disabled={!editable}>{Object.entries(OWNER_APPROVAL_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
                <label><span>Freigabedatum</span><input name="owner_approval_at" type="date" defaultValue={measure.ownerApprovalAt ?? ""} disabled={!editable} /></label>
                <label><span>Verantwortung</span><input name="responsible_party" defaultValue={measure.responsibleParty} disabled={!editable} /></label>
                <label><span>Partner</span><input name="partner_company" defaultValue={measure.partnerCompany ?? ""} disabled={!editable} /></label>
                <label><span>Zieltermin</span><input name="target_date" type="date" defaultValue={measure.targetDate ?? ""} disabled={!editable} /></label>
                <label><span>Geplanter Start</span><input name="planned_start_date" type="date" defaultValue={measure.plannedStartDate ?? ""} disabled={!editable} /></label>
                <label><span>Geplantes Ende</span><input name="planned_end_date" type="date" defaultValue={measure.plannedEndDate ?? ""} disabled={!editable} /></label>
                <label><span>Fertiggestellt</span><input name="completed_at" type="date" defaultValue={measure.completedAt ?? ""} disabled={!editable} /></label>
                <label><span>Sortierung</span><input name="sort_order" type="number" min="0" step="10" defaultValue={measure.sortOrder} disabled={!editable} /></label>
                <label className="wide"><span>Begründung</span><textarea name="rationale" rows={2} defaultValue={measure.rationale} disabled={!editable} /></label>
              </div>
              {editable ? (
                <div className="readiness-form-actions">
                  <button className="secondary-button" type="submit" name="_intent" value="save_measure">Maßnahme speichern</button>
                  <button className="danger-button" type="submit" name="_intent" value="delete_measure">Entfernen</button>
                </div>
              ) : null}
            </Form>
          ))}
        </div>

        {editable ? (
          <Form method="post" className="readiness-measure-editor new-measure">
            <input type="hidden" name="check_id" value={checkId} />
            <input type="hidden" name="version" value={check.version} />
            <div className="readiness-form-grid compact">
              <label><span>Kategorie</span><select name="category" defaultValue="OTHER">{CATEGORIES.map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label><span>Neue Maßnahme *</span><input name="title" placeholder="z. B. Parkett aufarbeiten" /></label>
              <label><span>Empfehlung</span><select name="decision" defaultValue="OPEN">{Object.entries(DECISION_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label><span>Status</span><select name="status" defaultValue="PROPOSED">{Object.entries(MEASURE_STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label><span>Eigentümerfreigabe</span><select name="owner_approval_status" defaultValue="NOT_REQUESTED">{Object.entries(OWNER_APPROVAL_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
              <label><span>Sortierung</span><input name="sort_order" type="number" min="0" step="10" defaultValue="100" /></label>
            </div>
            <button className="primary-button" type="submit" name="_intent" value="save_measure">Maßnahme hinzufügen</button>
          </Form>
        ) : null}

        {check.status === "FINALIZED" && canTask ? (
          <Form method="post" className="readiness-task-create">
            <input type="hidden" name="check_id" value={checkId} />
            <input type="hidden" name="version" value={check.version} />
            <h3>CRM-Aufgaben aus Maßnahmen erzeugen</h3>
            <p>Nur dringend empfohlene, empfohlene oder optionale, noch nicht abgeschlossene Maßnahmen können übernommen werden. Bereits erzeugte Aufgaben werden nicht dupliziert.</p>
            <div className="readiness-task-options">
              {viewModel.measures
                .filter((measure) => ["URGENTLY_RECOMMENDED", "RECOMMENDED", "OPTIONAL"].includes(measure.decision)
                  && !["DONE", "CHECKED", "DISMISSED"].includes(measure.status))
                .map((measure) => (
                  <label key={measure.id}>
                    <input type="checkbox" name="measure_ids" value={measure.id} disabled={measure.selectedForTasks} />
                    <span>{measure.title}{measure.selectedForTasks ? " · Aufgabe vorhanden" : ""}</span>
                  </label>
                ))}
            </div>
            <button className="primary-button" type="submit" name="_intent" value="create_tasks">Ausgewählte CRM-Aufgaben erzeugen</button>
          </Form>
        ) : null}
      </section>

      <section className="readiness-disclaimer">
        <strong>Foto-Dokumentation vorbereitet:</strong> Das Datenmodell kann Vorher-, Währenddessen- und Nachher-Medien mit separater Marketingfreigabe referenzieren. Der tatsächliche Foto-Storage wird weiterhin nicht automatisch aktiviert.
      </section>
    </div>
  );
}
