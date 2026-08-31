import { useEffect, useRef, useState, type ReactNode } from "react";
import "~/asset-preview-modal.css";

export type AssetPreviewKind = "image" | "pdf" | "video" | "file";

type MetadataEntry = {
  label: string;
  value: ReactNode;
};

type Props = {
  open: boolean;
  title: string;
  subtitle?: string;
  url?: string;
  downloadName?: string;
  kind: AssetPreviewKind;
  positionLabel?: string;
  metadata: MetadataEntry[];
  metadataEditor?: ReactNode;
  versions?: ReactNode;
  moreActions?: ReactNode;
  onClose: () => void;
  onPrevious?: () => void;
  onNext?: () => void;
  hasPrevious?: boolean;
  hasNext?: boolean;
};

function printAsset(url?: string) {
  if (!url) return;
  const printWindow = window.open(url, "_blank");
  if (!printWindow) return;
  try { printWindow.opener = null; } catch {}
  window.setTimeout(() => {
    try {
      printWindow.focus();
      printWindow.print();
    } catch {}
  }, 900);
}

export function AssetPreviewModal({
  open,
  title,
  subtitle,
  url,
  downloadName,
  kind,
  positionLabel,
  metadata,
  metadataEditor,
  versions,
  moreActions,
  onClose,
  onPrevious,
  onNext,
  hasPrevious = false,
  hasNext = false,
}: Props) {
  const [metadataVisible, setMetadataVisible] = useState(true);
  const [editing, setEditing] = useState(false);
  const [versionsVisible, setVersionsVisible] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const printable = kind === "image" || kind === "pdf";

  useEffect(() => {
    if (!open) return;
    setEditing(false);
    setVersionsVisible(false);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isEditingField = tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable;
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (!isEditingField && event.key === "ArrowLeft" && hasPrevious) {
        event.preventDefault();
        onPrevious?.();
      } else if (!isEditingField && event.key === "ArrowRight" && hasNext) {
        event.preventDefault();
        onNext?.();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [open, title, hasPrevious, hasNext, onClose, onPrevious, onNext]);

  if (!open) return null;

  return <div className="asset-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <section className={`asset-modal${metadataVisible ? "" : " metadata-hidden"}`} role="dialog" aria-modal="true" aria-label={`${title} Vorschau`}>
      <header className="asset-modal-header">
        <div className="asset-modal-heading">
          <p className="eyebrow">Vorschau{positionLabel ? ` · ${positionLabel}` : ""}</p>
          <h2>{title}</h2>
          {subtitle ? <p>{subtitle}</p> : null}
        </div>
        <div className="asset-modal-toolbar">
          <button className="secondary-button compact" type="button" onClick={onPrevious} disabled={!hasPrevious} aria-label="Vorheriges Element">← Vorheriges</button>
          <button className="secondary-button compact" type="button" onClick={onNext} disabled={!hasNext} aria-label="Nächstes Element">Nächstes →</button>
          {url ? <a className="secondary-button compact asset-action-link" href={url} target="_blank" rel="noreferrer">Original öffnen</a> : null}
          {url ? <a className="secondary-button compact asset-action-link" href={url} download={downloadName}>Herunterladen</a> : null}
          {printable && url ? <button className="secondary-button compact" type="button" onClick={() => printAsset(url)}>Drucken</button> : null}
          <button className="secondary-button compact" type="button" onClick={() => setMetadataVisible((value) => !value)}>{metadataVisible ? "Metadaten ausblenden" : "Metadaten anzeigen"}</button>
          {metadataEditor ? <button className={editing ? "primary-button asset-toolbar-primary" : "secondary-button compact"} type="button" onClick={() => { setMetadataVisible(true); setEditing((value) => !value); }}>{editing ? "Bearbeitung schließen" : "Metadaten bearbeiten"}</button> : null}
          <button ref={closeRef} className="asset-modal-close" type="button" onClick={onClose} aria-label="Vorschau schließen">×</button>
        </div>
      </header>

      <div className="asset-modal-layout">
        <div className="asset-preview-stage">
          {!url ? <div className="asset-preview-fallback"><strong>Keine Vorschau verfügbar</strong><span>Für dieses Element konnte kein temporärer Dateizugriff erzeugt werden.</span></div> : null}
          {url && kind === "image" ? <img className="asset-preview-image" src={url} alt={title}/> : null}
          {url && kind === "pdf" ? <iframe className="asset-preview-frame" src={url} title={`${title} PDF-Vorschau`}/> : null}
          {url && kind === "video" ? <video className="asset-preview-video" src={url} controls playsInline/> : null}
          {url && kind === "file" ? <div className="asset-preview-fallback"><strong>Direkte Vorschau nicht verfügbar</strong><span>Dieser Dateityp wird im Browser nicht zuverlässig dargestellt.</span><a className="primary-button asset-action-link" href={url} target="_blank" rel="noreferrer">Datei öffnen</a></div> : null}
        </div>

        {metadataVisible ? <aside className="asset-metadata-panel">
          <div className="asset-metadata-head"><div><p className="eyebrow">Dateiinformationen</p><h3>Metadaten</h3></div></div>
          <dl className="asset-metadata-list">
            {metadata.map((entry) => <div key={entry.label}><dt>{entry.label}</dt><dd>{entry.value || "—"}</dd></div>)}
          </dl>

          {editing && metadataEditor ? <section className="asset-editor-section" onSubmitCapture={() => setEditing(false)}><div className="asset-panel-subhead"><h4>Metadaten bearbeiten</h4></div>{metadataEditor}</section> : null}

          {versions ? <section className="asset-versions-section">
            <button className="asset-section-toggle" type="button" onClick={() => setVersionsVisible((value) => !value)}><span>Versionshistorie</span><span>{versionsVisible ? "−" : "+"}</span></button>
            {versionsVisible ? <div className="asset-versions-body">{versions}</div> : null}
          </section> : null}

          {moreActions ? <details className="asset-more-actions"><summary>⋯ Weitere Aktionen</summary><div>{moreActions}</div></details> : null}
        </aside> : null}
      </div>
    </section>
  </div>;
}
