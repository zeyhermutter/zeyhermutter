import { Form, Link } from "react-router";

export type SalesReadinessMediaSource = {
  key: string;
  bucket: string;
  path: string;
  title: string;
  subtitle: string;
  kind: "image" | "video" | "pdf" | "file";
  signedUrl: string | null;
};

export type SalesReadinessMediaItem = {
  id: string;
  measureId: string | null;
  measureTitle: string | null;
  areaKey: string;
  stage: string;
  internalNote: string;
  version: number;
  title: string;
  subtitle: string;
  kind: "image" | "video" | "pdf" | "file";
  signedUrl: string | null;
};

const AREA_LABELS: Record<string, string> = {
  CURRENT_STATE: "Ist-Zustand",
  DETAIL: "Relevantes Detail",
  MEASURE_EVIDENCE: "Nachweis / Unterlage",
  MEASURE_DOCUMENTATION: "Maßnahmendokumentation",
  OTHER: "Sonstiges",
};

const STAGE_LABELS: Record<string, string> = {
  BEFORE: "Vorher",
  DURING: "Währenddessen",
  AFTER: "Nachher",
};

function SourcePreview({ item }: { item: { kind: string; signedUrl: string | null; title: string } }) {
  if (item.kind === "image" && item.signedUrl) {
    return <img className="readiness-media-thumb" src={item.signedUrl} alt={item.title} />;
  }
  return (
    <div className="readiness-media-file-preview" aria-hidden="true">
      <strong>{item.kind === "pdf" ? "PDF" : item.kind === "video" ? "VIDEO" : "DATEI"}</strong>
    </div>
  );
}

export function SalesReadinessMediaPanel({
  checkId,
  checkVersion,
  checkStatus,
  propertyId,
  media,
  sources,
  measures,
  canWrite,
}: {
  checkId: string | null;
  checkVersion: number;
  checkStatus: string;
  propertyId: string | null;
  media: SalesReadinessMediaItem[];
  sources: SalesReadinessMediaSource[];
  measures: Array<{ id: string; title: string }>;
  canWrite: boolean;
}) {
  if (!checkId) return null;
  const editable = canWrite && checkStatus !== "FINALIZED";

  return (
    <section className="data-card readiness-media-panel">
      <div className="card-head">
        <div>
          <p className="eyebrow">Medien & Nachweise</p>
          <h2>Check visuell dokumentieren</h2>
          <p className="lead-card-caption">
            Vorhandene Objektmedien und aktuelle Dokumentversionen werden dem Check oder einer Maßnahme zugeordnet. Die Originalablage bleibt unverändert.
          </p>
        </div>
        <span className="subtle">{media.length}</span>
      </div>

      {!propertyId ? (
        <p className="empty-state">
          Dieser Check ist noch keiner Immobilie zugeordnet. Medien und Nachweise können erst aus einer verknüpften Immobilienakte übernommen werden.
        </p>
      ) : (
        <div className="readiness-media-source-links">
          <Link className="secondary-button" to={`/properties/${propertyId}/media`}>Medienbibliothek öffnen</Link>
          <Link className="secondary-button" to={`/properties/${propertyId}/documents`}>Unterlagen öffnen</Link>
        </div>
      )}

      <div className="readiness-media-grid">
        {media.map((item) => (
          <article className="readiness-media-card" key={item.id}>
            {item.signedUrl ? (
              <a className="readiness-media-preview-link" href={item.signedUrl} target="_blank" rel="noreferrer">
                <SourcePreview item={item} />
              </a>
            ) : <SourcePreview item={item} />}
            <div className="readiness-media-card-copy">
              <div className="readiness-media-tags">
                <span>{AREA_LABELS[item.areaKey] ?? item.areaKey}</span>
                <span>{STAGE_LABELS[item.stage] ?? item.stage}</span>
              </div>
              <strong>{item.title}</strong>
              <small>{item.subtitle}</small>
              <p>{item.measureTitle ? `Maßnahme: ${item.measureTitle}` : "Gesamter Check"}</p>
              {item.internalNote ? <p>{item.internalNote}</p> : null}
            </div>

            {editable ? (
              <Form method="post" className="readiness-media-edit-form">
                <input type="hidden" name="check_id" value={checkId} />
                <input type="hidden" name="version" value={checkVersion} />
                <input type="hidden" name="media_id" value={item.id} />
                <div className="readiness-form-grid compact">
                  <label>
                    <span>Zuordnung</span>
                    <select name="area_key" defaultValue={item.areaKey}>
                      {Object.entries(AREA_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label>
                    <span>Zeitpunkt</span>
                    <select name="stage" defaultValue={item.stage}>
                      {Object.entries(STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                  </label>
                  <label className="wide">
                    <span>Maßnahme</span>
                    <select name="measure_id" defaultValue={item.measureId ?? ""}>
                      <option value="">Gesamter Check</option>
                      {measures.map((measure) => <option key={measure.id} value={measure.id}>{measure.title}</option>)}
                    </select>
                  </label>
                  <label className="wide">
                    <span>Interne Notiz</span>
                    <textarea name="internal_note" rows={2} defaultValue={item.internalNote} />
                  </label>
                </div>
                <div className="readiness-form-actions">
                  <button className="secondary-button" type="submit" name="_intent" value="save_media">Zuordnung speichern</button>
                  <button className="danger-button" type="submit" name="_intent" value="delete_media">Zuordnung entfernen</button>
                </div>
              </Form>
            ) : null}
          </article>
        ))}
        {media.length === 0 ? <p className="empty-state">Noch keine Medien oder Nachweise zugeordnet.</p> : null}
      </div>

      {editable && propertyId ? (
        <Form method="post" className="readiness-media-add-form">
          <input type="hidden" name="check_id" value={checkId} />
          <input type="hidden" name="version" value={checkVersion} />
          <div className="card-head">
            <div><p className="eyebrow">Bestehende Ablage verwenden</p><h3>Medium oder Nachweis zuordnen</h3></div>
          </div>
          {sources.length ? (
            <>
              <div className="readiness-form-grid compact">
                <label className="wide">
                  <span>Quelle *</span>
                  <select name="source_ref" required defaultValue="">
                    <option value="" disabled>Quelle auswählen</option>
                    {sources.map((source) => <option key={source.key} value={source.key}>{source.title} · {source.subtitle}</option>)}
                  </select>
                </label>
                <label>
                  <span>Zuordnung *</span>
                  <select name="area_key" defaultValue="CURRENT_STATE">
                    {Object.entries(AREA_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label>
                  <span>Zeitpunkt *</span>
                  <select name="stage" defaultValue="BEFORE">
                    {Object.entries(STAGE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                <label className="wide">
                  <span>Maßnahme</span>
                  <select name="measure_id" defaultValue="">
                    <option value="">Gesamter Check</option>
                    {measures.map((measure) => <option key={measure.id} value={measure.id}>{measure.title}</option>)}
                  </select>
                </label>
                <label className="wide">
                  <span>Interne Notiz</span>
                  <textarea name="internal_note" rows={3} placeholder="Was belegt oder dokumentiert diese Datei?" />
                </label>
              </div>
              <button className="primary-button" type="submit" name="_intent" value="save_media">Zuordnen</button>
            </>
          ) : (
            <p className="empty-state">In der Immobilienakte sind aktuell keine nutzbaren Medien oder Dokumentversionen vorhanden.</p>
          )}
        </Form>
      ) : null}

      {checkStatus === "FINALIZED" ? (
        <p className="readiness-disclaimer">
          <strong>Historische Revision:</strong> Medien- und Nachweiszuordnungen dieser finalisierten Revision sind unveränderlich. Für Änderungen eine neue Revision anlegen.
        </p>
      ) : null}
    </section>
  );
}
