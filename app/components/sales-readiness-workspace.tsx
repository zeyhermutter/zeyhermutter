import { Form } from "react-router";
import type { SalesReadinessScenarioViewModel, SalesReadinessViewModel } from "~/lib/sales-readiness";
import { CONFIDENCE_LABELS, DECISION_LABELS, MEASURE_STATUS_LABELS, SALES_READINESS_STATUS_LABELS } from "~/lib/sales-readiness";

const CATEGORIES = [
  ["CLEARANCE_DISPOSAL", "Entrümpelung & Entsorgung"], ["CLEANING", "Reinigung"], ["MINOR_REPAIRS", "Kleinere Reparaturen"],
  ["PAINTING", "Malerarbeiten"], ["FLOORING_PARQUET", "Boden & Parkett"], ["GARDEN_EXTERIOR", "Garten & Außenbereich"],
  ["FURNITURE_STYLING", "Möbel & Styling"], ["DOCUMENTS", "Unterlagen"], ["ENERGY_CERTIFICATE", "Energieausweis"],
  ["PHOTO_PREPARATION", "Fotovorbereitung"], ["OTHER", "Sonstiges"],
] as const;

function euro(value: number | null) {
  return value === null ? "—" : new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(value);
}
function inputDate(value: string | null) { return value ? value.slice(0, 10) : ""; }
function valueOrBlank(value: number | null) { return value ?? ""; }
function scenarioEffect(scenario: SalesReadinessScenarioViewModel, base?: SalesReadinessScenarioViewModel) {
  if (!base || scenario.kind === "AS_IS") return null;
  if (scenario.estimatedSalePriceMin === null || scenario.estimatedSalePriceMax === null || base.estimatedSalePriceMin === null || base.estimatedSalePriceMax === null) return null;
  const upliftMin = scenario.estimatedSalePriceMin - base.estimatedSalePriceMin;
  const upliftMax = scenario.estimatedSalePriceMax - base.estimatedSalePriceMax;
  const advantageMin = scenario.investmentMax === null ? null : upliftMin - scenario.investmentMax;
  const advantageMax = scenario.investmentMin === null ? null : upliftMax - scenario.investmentMin;
  return { upliftMin, upliftMax, advantageMin, advantageMax };
}

export function SalesReadinessWorkspace({ viewModel, canWrite, canFinalize, canTask }: {
  viewModel: SalesReadinessViewModel; canWrite: boolean; canFinalize: boolean; canTask: boolean;
}) {
  const check = viewModel.check;
  const editable = canWrite && check.status !== "FINALIZED";
  const baseScenario = viewModel.scenarios.find((scenario) => scenario.kind === "AS_IS");
  if (!check.id) {
    return <div className="readiness-workspace">
      <section className="readiness-mode-banner preview"><strong>BETA-Backend aktiv</strong><span>Noch kein Verkaufsfertig-Check für diesen Lead vorhanden.</span></section>
      <section className="data-card readiness-empty-start">
        <p className="eyebrow">{viewModel.lead.number}</p><h2>{viewModel.lead.propertyLabel}</h2>
        <p>{viewModel.lead.contactLabel} · Verantwortlich: {check.responsibleUserLabel}</p>
        {canWrite ? <Form method="post"><input type="hidden" name="_intent" value="create"/><button className="primary-button" type="submit">Verkaufsfertig-Check starten</button></Form> : <p className="empty-state">Keine Schreibberechtigung.</p>}
      </section>
    </div>;
  }
  return <div className="readiness-workspace">
    <section className="readiness-mode-banner preview" role="status"><strong>BETA · Datenbank aktiv</strong><span>Änderungen werden versioniert gespeichert. Finalisierte Revisionen sind unveränderlich.</span></section>
    <section className="readiness-overview data-card">
      <div className="readiness-overview-copy"><p className="eyebrow">{viewModel.lead.number} · Verkaufsfertig-Check</p><div className="readiness-title-row"><h2>{viewModel.lead.propertyLabel}</h2><span className={`readiness-status status-${check.status.toLowerCase()}`}>{SALES_READINESS_STATUS_LABELS[check.status]}</span></div><p>{viewModel.lead.contactLabel} · Verantwortlich: {check.responsibleUserLabel}</p></div>
      <div className="readiness-actions">
        {check.status === "DRAFT" && canWrite ? <Form method="post"><input type="hidden" name="_intent" value="ready"/><input type="hidden" name="check_id" value={check.id}/><input type="hidden" name="version" value={check.version}/><button className="secondary-button" type="submit">Zur Prüfung markieren</button></Form> : null}
        {check.status === "READY_FOR_REVIEW" && canFinalize ? <Form method="post"><input type="hidden" name="_intent" value="finalize"/><input type="hidden" name="check_id" value={check.id}/><input type="hidden" name="version" value={check.version}/><button className="primary-button" type="submit">Finalisieren</button></Form> : null}
        {check.status === "FINALIZED" && canFinalize ? <Form method="post"><input type="hidden" name="_intent" value="revision"/><input type="hidden" name="check_id" value={check.id}/><input type="hidden" name="version" value={check.version}/><button className="secondary-button" type="submit">Revision anlegen</button></Form> : null}
      </div>
    </section>

    <Form method="post" className="data-card readiness-edit-card">
      <input type="hidden" name="_intent" value="save_check"/><input type="hidden" name="check_id" value={check.id}/><input type="hidden" name="version" value={check.version}/>
      <div className="card-head"><div><p className="eyebrow">Check-Grunddaten</p><h2>Ausgangslage und Ziel</h2></div><span className="readiness-version">Version {check.version}</span></div>
      <div className="readiness-form-grid">
        <label><span>Besichtigung</span><input name="inspection_date" type="date" defaultValue={inputDate(check.inspectionAt)} disabled={!editable}/></label>
        <label><span>Gewünschter Zeitrahmen</span><input name="desired_timeframe" defaultValue={check.desiredTimeframe} disabled={!editable} placeholder="z. B. Vermarktungsstart in 6 Wochen"/></label>
        <label className="wide"><span>Ausgangssituation</span><textarea name="starting_situation" rows={4} defaultValue={check.startingSituation} disabled={!editable}/></label>
        <label className="wide"><span>Verkaufsziel</span><textarea name="sale_objective" rows={4} defaultValue={check.saleObjective} disabled={!editable}/></label>
        <label className="wide"><span>Gesamtbeurteilung *</span><textarea name="overall_assessment" rows={5} defaultValue={check.overallAssessment} disabled={!editable}/></label>
        <label className="wide"><span>Annahmen und Unsicherheiten *</span><textarea name="assumptions_and_uncertainties" rows={5} defaultValue={check.assumptionsAndUncertainties} disabled={!editable}/></label>
      </div>
      {editable ? <div className="readiness-form-actions"><button className="primary-button" type="submit">Grunddaten speichern</button></div> : null}
    </Form>

    <section className="readiness-section">
      <div className="readiness-section-head"><div><p className="eyebrow">Drei Blickwinkel</p><h2>Verkaufsszenarien vergleichen</h2></div><p>Mehrerlös und wirtschaftlicher Vorteil sind Schätzwerte aus den eingetragenen Korridoren – keine Verkaufspreisgarantie.</p></div>
      <div className="readiness-scenario-grid">
        {viewModel.scenarios.map((scenario) => {
          const effect = scenarioEffect(scenario, baseScenario);
          return <Form method="post" className={`readiness-scenario ${scenario.recommended ? "recommended" : ""}`} key={scenario.id}>
            <input type="hidden" name="_intent" value="save_scenario"/><input type="hidden" name="check_id" value={check.id}/><input type="hidden" name="version" value={check.version}/><input type="hidden" name="scenario_id" value={scenario.id}/>
            <div className="readiness-scenario-head"><span>{scenario.recommended ? "Empfehlung" : "Szenario"}</span><small>{scenario.kind}</small></div>
            <label><span>Titel</span><input name="title" defaultValue={scenario.title} disabled={!editable}/></label>
            <label><span>Beschreibung</span><textarea name="description" rows={3} defaultValue={scenario.description} disabled={!editable}/></label>
            <label><span>Annahmen</span><textarea name="assumptions" rows={3} defaultValue={scenario.assumptions} disabled={!editable}/></label>
            <label><span>Einschätzungssicherheit</span><select name="confidence" defaultValue={scenario.confidence} disabled={!editable}>{Object.entries(CONFIDENCE_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
            <div className="readiness-number-grid"><label><span>Investition min.</span><input name="investment_min" type="number" min="0" step="100" defaultValue={valueOrBlank(scenario.investmentMin)} disabled={!editable}/></label><label><span>Investition max.</span><input name="investment_max" type="number" min="0" step="100" defaultValue={valueOrBlank(scenario.investmentMax)} disabled={!editable}/></label><label><span>Verkaufspreis min.</span><input name="estimated_sale_price_min" type="number" min="0" step="1000" defaultValue={valueOrBlank(scenario.estimatedSalePriceMin)} disabled={!editable}/></label><label><span>Verkaufspreis max.</span><input name="estimated_sale_price_max" type="number" min="0" step="1000" defaultValue={valueOrBlank(scenario.estimatedSalePriceMax)} disabled={!editable}/></label><label><span>Dauer min. Wochen</span><input name="duration_weeks_min" type="number" min="0" step="1" defaultValue={valueOrBlank(scenario.durationWeeksMin)} disabled={!editable}/></label><label><span>Dauer max. Wochen</span><input name="duration_weeks_max" type="number" min="0" step="1" defaultValue={valueOrBlank(scenario.durationWeeksMax)} disabled={!editable}/></label></div>
            {scenario.kind !== "AS_IS" ? <label className="readiness-recommend"><input type="checkbox" name="is_recommended" defaultChecked={scenario.recommended} disabled={!editable}/> Dieses Szenario empfehlen</label> : <input type="hidden" name="is_recommended" value=""/>}
            {effect ? <div className="readiness-calculation"><strong>Schätzwerte gegenüber Ist-Zustand</strong><span>Geschätzter Mehrerlös: {euro(effect.upliftMin)} bis {euro(effect.upliftMax)}</span><span>Potenzieller wirtschaftlicher Vorteil: {effect.advantageMin === null || effect.advantageMax === null ? "Investition ergänzen" : `${euro(effect.advantageMin)} bis ${euro(effect.advantageMax)}`}</span></div> : null}
            {editable ? <button className="secondary-button" type="submit">Szenario speichern</button> : null}
          </Form>;
        })}
      </div>
      <p className="readiness-disclaimer"><strong>Hinweis:</strong> Preis-, Kosten- und Mehrerlösangaben sind fachliche Einschätzungen auf Basis der verfügbaren Informationen und keine Garantie.</p>
    </section>

    <section className="data-card readiness-measures">
      <div className="card-head"><div><p className="eyebrow">Maßnahmen</p><h2>Empfehlungen priorisieren</h2><p className="lead-card-caption">Maßnahmen bleiben eigenständige Beratungs-/Umsetzungsobjekte. CRM-Aufgaben werden daraus separat erzeugt.</p></div></div>
      <div className="readiness-measure-list">
        {viewModel.measures.map((measure) => <Form method="post" className="readiness-measure-editor" key={measure.id}>
          <input type="hidden" name="_intent" value="save_measure"/><input type="hidden" name="check_id" value={check.id}/><input type="hidden" name="version" value={check.version}/><input type="hidden" name="measure_id" value={measure.id}/>
          <div className="readiness-form-grid compact"><label><span>Kategorie</span><select name="category" defaultValue={measure.category} disabled={!editable}>{CATEGORIES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Titel</span><input name="title" defaultValue={measure.title} disabled={!editable}/></label><label className="wide"><span>Beschreibung</span><textarea name="description" rows={2} defaultValue={measure.description} disabled={!editable}/></label><label><span>Empfehlung</span><select name="decision" defaultValue={measure.decision} disabled={!editable}>{Object.entries(DECISION_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label><span>Status</span><select name="status" defaultValue={measure.status} disabled={!editable}>{Object.entries(MEASURE_STATUS_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label><span>Kosten min.</span><input name="cost_min" type="number" min="0" step="50" defaultValue={valueOrBlank(measure.costMin)} disabled={!editable}/></label><label><span>Kosten max.</span><input name="cost_max" type="number" min="0" step="50" defaultValue={valueOrBlank(measure.costMax)} disabled={!editable}/></label><label><span>Verantwortung</span><input name="responsible_party" defaultValue={measure.responsibleParty} disabled={!editable}/></label><label><span>Partner</span><input name="partner_company" defaultValue={measure.partnerCompany ?? ""} disabled={!editable}/></label><label><span>Zieltermin</span><input name="target_date" type="date" defaultValue={measure.targetDate ?? ""} disabled={!editable}/></label><label><span>Sortierung</span><input name="sort_order" type="number" min="0" step="10" defaultValue={measure.sortOrder} disabled={!editable}/></label><label className="wide"><span>Begründung</span><textarea name="rationale" rows={2} defaultValue={measure.rationale} disabled={!editable}/></label></div>
          {editable ? <div className="readiness-form-actions"><button className="secondary-button" type="submit">Maßnahme speichern</button><button className="danger-button" type="submit" name="_intent" value="delete_measure">Entfernen</button></div> : null}
        </Form>)}
      </div>
      {editable ? <Form method="post" className="readiness-measure-editor new-measure"><input type="hidden" name="_intent" value="save_measure"/><input type="hidden" name="check_id" value={check.id}/><input type="hidden" name="version" value={check.version}/><div className="readiness-form-grid compact"><label><span>Kategorie</span><select name="category" defaultValue="OTHER">{CATEGORIES.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><label><span>Neue Maßnahme *</span><input name="title" placeholder="z. B. Parkett aufarbeiten"/></label><label><span>Empfehlung</span><select name="decision" defaultValue="OPEN">{Object.entries(DECISION_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label><span>Status</span><select name="status" defaultValue="OPEN">{Object.entries(MEASURE_STATUS_LABELS).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label><label><span>Sortierung</span><input name="sort_order" type="number" min="0" step="10" defaultValue="100"/></label></div><button className="primary-button" type="submit">Maßnahme hinzufügen</button></Form> : null}

      {check.status === "FINALIZED" && canTask ? <Form method="post" className="readiness-task-create"><input type="hidden" name="_intent" value="create_tasks"/><input type="hidden" name="check_id" value={check.id}/><input type="hidden" name="version" value={check.version}/><h3>CRM-Aufgaben aus Maßnahmen erzeugen</h3><p>Nur empfohlene oder optionale Maßnahmen können übernommen werden; bestehende Aufgaben werden nicht dupliziert.</p><div className="readiness-task-options">{viewModel.measures.filter((m)=>["URGENTLY_RECOMMENDED","RECOMMENDED","OPTIONAL"].includes(m.decision) && m.status !== "DISMISSED").map((m)=><label key={m.id}><input type="checkbox" name="measure_ids" value={m.id} disabled={m.selectedForTasks}/><span>{m.title}{m.selectedForTasks ? " · Aufgabe vorhanden" : ""}</span></label>)}</div><button className="primary-button" type="submit">Ausgewählte CRM-Aufgaben erzeugen</button></Form> : null}
    </section>

    <section className="readiness-disclaimer"><strong>Foto-Dokumentation vorbereitet:</strong> Das Datenmodell kann Vorher-, Währenddessen- und Nachher-Medien mit separater Marketingfreigabe referenzieren. Der tatsächliche Foto-Storage wird in diesem Durchlauf bewusst nicht automatisch aktiviert.</section>
  </div>;
}
