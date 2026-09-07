import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router";
import { HELP_CHAPTERS, chapterForPath, type HelpChapter } from "~/help-content";
import { HelpChapterBody } from "~/components/help-blocks";

// Der Hilfe-Knopf, der auf jeder internen Seite steht.
//
// Er bestimmt aus dem aktuellen Pfad das zustaendige Kapitel und oeffnet es als
// Fenster ueber der Seite. Bewusst kein Seitenwechsel: wer mitten in einem
// Formular nachschlaegt, soll seine Eingaben nicht verlieren.
//
// Im Fenster steht zusaetzlich "In neuem Tab" — fuer alle, die die Anleitung
// dauerhaft daneben liegen haben wollen, etwa auf einem zweiten Bildschirm.
//
// Die Zuordnung Seite → Kapitel steht in app/help-content.ts bei den Kapiteln
// selbst. Wer eine neue Seite baut, traegt ihren Pfad dort in `pfade` ein; hier
// ist nichts zu aendern.

export function HelpEntry() {
  const { pathname } = useLocation();
  const [offen, setOffen] = useState(false);
  const [kapitelId, setKapitelId] = useState<string | null>(null);
  const dialog = useRef<HTMLDivElement | null>(null);
  const ausloeser = useRef<HTMLButtonElement | null>(null);

  const passend = chapterForPath(pathname);
  const gezeigt: HelpChapter | null =
    HELP_CHAPTERS.find((k) => k.id === kapitelId) ?? passend ?? HELP_CHAPTERS[0] ?? null;

  const schliessen = useCallback(() => {
    setOffen(false);
    setKapitelId(null);
    ausloeser.current?.focus();
  }, []);

  // Beim Seitenwechsel schliessen: sonst stuende die Hilfe zur vorigen Seite
  // ueber der neuen.
  useEffect(() => { setOffen(false); setKapitelId(null); }, [pathname]);

  useEffect(() => {
    if (!offen) return;
    const beiTaste = (e: KeyboardEvent) => { if (e.key === "Escape") schliessen(); };
    document.addEventListener("keydown", beiTaste);
    dialog.current?.focus();
    return () => document.removeEventListener("keydown", beiTaste);
  }, [offen, schliessen]);

  if (pathname === "/crm/hilfe") return null;

  const titel = passend
    ? `Anleitung, Kapitel ${passend.nummer}: ${passend.titel}`
    : "Anleitung öffnen";
  const neuesFenster = gezeigt ? `/crm/hilfe#${gezeigt.id}` : "/crm/hilfe";

  return (
    <>
      <button
        className="help-entry"
        type="button"
        ref={ausloeser}
        onClick={() => setOffen(true)}
        title={titel}
        aria-label={titel}
        aria-haspopup="dialog"
      >
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
          <path d="M9.6 9.2a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          <circle cx="12" cy="16.6" r="1" fill="currentColor" />
        </svg>
        <span>Hilfe</span>
      </button>

      {offen && gezeigt ? (
        <div
          className="help-modal-backdrop"
          role="presentation"
          onMouseDown={(e) => { if (e.target === e.currentTarget) schliessen(); }}
        >
          <div
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="help-modal-titel"
            tabIndex={-1}
            ref={dialog}
          >
            <div className="help-modal-kopf">
              <div>
                <p className="eyebrow">Anleitung · Kapitel {gezeigt.nummer}</p>
                <h2 id="help-modal-titel">{gezeigt.titel}</h2>
              </div>
              <div className="help-modal-aktionen">
                <a
                  className="secondary-button"
                  href={neuesFenster}
                  target="_blank"
                  rel="noreferrer"
                  title="Die vollständige Anleitung in einem eigenen Tab öffnen"
                >
                  In neuem Tab öffnen ↗
                </a>
                <button className="help-modal-schliessen" type="button" onClick={schliessen} aria-label="Schließen">×</button>
              </div>
            </div>

            {!passend ? (
              <div className="help-hinweis">
                Zu dieser Seite gibt es noch kein eigenes Kapitel. Unten steht das
                Inhaltsverzeichnis der ganzen Anleitung.
              </div>
            ) : null}

            <div className="help-modal-inhalt">
              <HelpChapterBody kapitel={gezeigt} />
            </div>

            <div className="help-modal-kapitelwahl">
              <p className="eyebrow">Alle Kapitel</p>
              <div className="help-modal-kapitelliste">
                {HELP_CHAPTERS.map((k) => (
                  <button
                    className={`help-modal-kapitelknopf${k.id === gezeigt.id ? " aktiv" : ""}`}
                    type="button"
                    key={k.id}
                    onClick={() => { setKapitelId(k.id); dialog.current?.scrollTo({ top: 0 }); }}
                  >
                    <span className="help-modal-kapitelnummer">{k.nummer}</span>
                    {k.titel}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
