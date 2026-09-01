import type { SalesReadinessViewModel } from "~/lib/sales-readiness";
import {
  CONFIDENCE_LABELS,
  DECISION_LABELS,
  MEASURE_STATUS_LABELS,
  SALES_READINESS_STATUS_LABELS,
} from "~/lib/sales-readiness";

function euro(value: number | null) {
  return value === null
    ? "Noch offen"
    : new Intl.NumberFormat("de-DE", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(value);
}

function range(min: number | null, max: number | null, suffix = "") {
  if (min === null || max === null) return "Noch offen";
  return `${euro(min)} bis ${euro(max)}${suffix}`;
}

function date(value: string | null) {
  if (!value) return "Noch offen";
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(value));
}

export function SalesReadinessWorkspace({
  viewModel,
  preview,
}: {
  viewModel: SalesReadinessViewModel;
  preview: boolean;
}) {
  const statusLabel = SALES_READINESS_STATUS_LABELS[viewModel.check.status];
  return (
    <div className="readiness-workspace">
      <section className={`readiness-mode-banner ${preview ? "preview" : "locked"}`} role="status">
        <strong>{preview ? "Lokale Vorschau mit synthetischen Daten" : "Backend noch nicht freigeschaltet"}</strong>
        <span>
          {preview
            ? "Diese Angaben gehören zu keiner realen Person und werden nicht gespeichert."
            : "Die Oberfläche ist vorbereitet. Bis zur genehmigten Migration werden keine Verkaufsfertig-Daten geladen oder gespeichert."}
        </span>
      </section>

      <section className="readiness-overview data-card">
        <div className="readiness-overview-copy">
          <p className="eyebrow">{viewModel.lead.number} · Verkaufsfertig-Check</p>
          <div className="readiness-title-row">
            <h2>{viewModel.lead.propertyLabel}</h2>
            <span className={`readiness-status status-${viewModel.check.status.toLowerCase()}`}>{statusLabel}</span>
          </div>
          <p>{viewModel.lead.contactLabel} · Verantwortlich: {viewModel.check.responsibleUserLabel}</p>
        </div>
        <div className="readiness-actions" aria-label="Geplanter Workflow">
          <button type="button" className="secondary-button" disabled>Entwurf bearbeiten</button>
          <button type="button" className="secondary-button" disabled>Zur Prüfung markieren</button>
          <button type="button" className="primary-button" disabled>Finalisieren</button>
          <button type="button" className="secondary-button" disabled>Revision anlegen</button>
        </div>
      </section>

      <section className="readiness-facts data-card">
        <div className="card-head">
          <div><p className="eyebrow">Check-Grunddaten</p><h2>Ausgangslage und Ziel</h2></div>
          <span className="readiness-version">Version {viewModel.check.version}</span>
        </div>
        <dl className="readiness-fact-grid">
          <div><dt>Besichtigung</dt><dd>{date(viewModel.check.inspectionAt)}</dd></div>
          <div><dt>Status</dt><dd>{statusLabel}</dd></div>
          <div><dt>Zeitrahmen</dt><dd>{viewModel.check.desiredTimeframe}</dd></div>
          <div><dt>Verantwortlich</dt><dd>{viewModel.check.responsibleUserLabel}</dd></div>
        </dl>
        <div className="readiness-text-grid">
          <article><h3>Ausgangssituation</h3><p>{viewModel.check.startingSituation}</p></article>
          <article><h3>Verkaufsziel</h3><p>{viewModel.check.saleObjective}</p></article>
          <article><h3>Gesamtbeurteilung</h3><p>{viewModel.check.overallAssessment}</p></article>
          <article><h3>Annahmen und Unsicherheiten</h3><p>{viewModel.check.assumptionsAndUncertainties}</p></article>
        </div>
      </section>

      <section className="readiness-section">
        <div className="readiness-section-head">
          <div><p className="eyebrow">Drei Blickwinkel</p><h2>Verkaufsszenarien vergleichen</h2></div>
          <p>Investition, zeitlicher Aufwand und geschätzter Verkaufskorridor werden gemeinsam betrachtet.</p>
        </div>
        <div className="readiness-scenario-grid">
          {viewModel.scenarios.map((scenario) => (
            <article className={`readiness-scenario ${scenario.recommended ? "recommended" : ""}`} key={scenario.id}>
              <div className="readiness-scenario-head">
                <span>{scenario.recommended ? "Empfehlung" : "Szenario"}</span>
                <small>Sicherheit: {CONFIDENCE_LABELS[scenario.confidence]}</small>
              </div>
              <h3>{scenario.title}</h3>
              <p>{scenario.description}</p>
              <dl>
                <div><dt>Investition</dt><dd>{range(scenario.investmentMin, scenario.investmentMax)}</dd></div>
                <div><dt>Verkaufspreis, geschätzt</dt><dd>{range(scenario.estimatedSalePriceMin, scenario.estimatedSalePriceMax)}</dd></div>
                <div><dt>Zeitbedarf</dt><dd>{scenario.durationWeeksMin === null || scenario.durationWeeksMax === null ? "Noch offen" : `${scenario.durationWeeksMin} bis ${scenario.durationWeeksMax} Wochen`}</dd></div>
              </dl>
              <div className="readiness-assumption"><strong>Annahmen</strong><p>{scenario.assumptions}</p></div>
            </article>
          ))}
        </div>
        <p className="readiness-disclaimer"><strong>Wichtiger Hinweis:</strong> Alle Werte sind fachliche Einschätzungen und keine Garantie eines bestimmten Verkaufspreises.</p>
      </section>

      <section className="data-card readiness-measures">
        <div className="card-head">
          <div><p className="eyebrow">Maßnahmen</p><h2>Empfehlungen priorisieren</h2><p className="lead-card-caption">Handwerksarbeiten werden von geeigneten Partnerbetrieben ausgeführt. ZeyherMutter berät, koordiniert und behält den Verkaufsprozess im Blick.</p></div>
          <button type="button" className="primary-button" disabled>CRM-Aufgaben erzeugen</button>
        </div>
        {viewModel.measures.length ? (
          <div className="readiness-measure-list">
            {viewModel.measures.map((measure) => (
              <article className="readiness-measure" key={measure.id}>
                <div className="readiness-measure-select"><input type="checkbox" checked={measure.selectedForTasks} readOnly aria-label={`${measure.title} für Aufgabenerzeugung auswählen`} /></div>
                <div className="readiness-measure-main">
                  <div className="readiness-measure-heading"><span>{measure.category}</span><strong>{measure.title}</strong></div>
                  <p>{measure.description}</p>
                  <small>{measure.rationale}</small>
                </div>
                <dl>
                  <div><dt>Entscheidung</dt><dd>{DECISION_LABELS[measure.decision]}</dd></div>
                  <div><dt>Kosten</dt><dd>{range(measure.costMin, measure.costMax)}</dd></div>
                  <div><dt>Verantwortung</dt><dd>{measure.responsibleParty}</dd></div>
                  <div><dt>Partner</dt><dd>{measure.partnerCompany ?? "Nicht vorgesehen"}</dd></div>
                  <div><dt>Zieltermin</dt><dd>{date(measure.targetDate)}</dd></div>
                  <div><dt>Status</dt><dd>{MEASURE_STATUS_LABELS[measure.status]}</dd></div>
                </dl>
              </article>
            ))}
          </div>
        ) : <p className="empty-state">Noch keine Maßnahmen erfasst. Die Kategorien und Bearbeitungslogik sind für die spätere Aktivierung vorbereitet.</p>}
      </section>
    </div>
  );
}
