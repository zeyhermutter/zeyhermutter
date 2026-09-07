import { useEffect, useState } from "react";
import { Link } from "react-router";
import type { Route } from "./+types/help";
import { HELP_CHAPTERS, HELP_INTRO, HELP_TITLE } from "~/help-content";
import { HelpChapterBody } from "~/components/help-blocks";
import "~/help.css";

export function meta() {
  return [{ title: `${HELP_TITLE} · ZeyherMutterOS` }, { name: "robots", content: "noindex,nofollow" }];
}

// Kein Loader: die Anleitung ist statischer Inhalt aus help-content.ts und
// braucht weder Datenbank noch Berechtigungspruefung. Sie liegt trotzdem hinter
// der Anmeldung, weil sie interne Ablaeufe beschreibt.

export default function Help() {
  // Kommt der Aufruf aus dem Hilfe-Fenster, steht das Zielkapitel im Anker.
  //
  // Der Anker wird bewusst erst im Browser gelesen: Browser senden ihn nicht an
  // den Server, die serverseitig gerenderte Seite kennt ihn also nicht. Ohne
  // dieses Nachlesen sprang die Seite zwar an die richtige Stelle, hob das
  // Kapitel aber nie hervor. Auf hashchange hoeren, damit auch das Klicken im
  // Inhaltsverzeichnis die Hervorhebung mitzieht.
  const [aktiv, setAktiv] = useState("");
  useEffect(() => {
    const lesen = () => setAktiv(window.location.hash.replace("#", ""));
    lesen();
    window.addEventListener("hashchange", lesen);
    return () => window.removeEventListener("hashchange", lesen);
  }, []);

  return (
    <main className="editor-shell help-shell">
      <header className="editor-header" id="seitenanfang">
        <div>
          <Link className="back-link" to="/crm">← CRM</Link>
          <p className="eyebrow">Anleitung</p>
          <h1 className="editor-title">{HELP_TITLE}</h1>
          <p className="editor-meta">{HELP_INTRO}</p>
        </div>
        <div className="header-actions"><span className="badge">{__APP_ENV_LABEL__}</span></div>
      </header>

      <nav className="data-card help-inhalt" aria-label="Inhaltsverzeichnis">
        <div className="card-head"><div><p className="eyebrow">Inhalt</p><h2>Inhaltsverzeichnis</h2></div><span className="subtle">{HELP_CHAPTERS.length} Kapitel</span></div>
        <ol className="help-inhalt-liste">
          {HELP_CHAPTERS.map((k) => (
            <li key={k.id} className={aktiv === k.id ? "aktiv" : undefined}>
              <a href={`#${k.id}`}>
                <span className="help-inhalt-nummer">{k.nummer}</span>
                <span><strong>{k.titel}</strong><small>{k.kurz}</small></span>
              </a>
            </li>
          ))}
        </ol>
      </nav>

      {HELP_CHAPTERS.map((k) => (
        <section className={`data-card help-kapitel${aktiv === k.id ? " aktiv" : ""}`} id={k.id} key={k.id}>
          <div className="card-head">
            <div><p className="eyebrow">Kapitel {k.nummer}</p><h2>{k.titel}</h2></div>
            <a className="subtle-link" href="#seitenanfang">↑ Inhalt</a>
          </div>
          <HelpChapterBody kapitel={k} />
        </section>
      ))}
    </main>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  return (
    <main className="editor-shell">
      <section className="data-card">
        <h2>Die Anleitung konnte nicht geladen werden.</h2>
        <p>{error instanceof Error ? error.message : "Unbekannter Fehler."}</p>
        <Link className="subtle-link" to="/crm">← Zurück zum CRM</Link>
      </section>
    </main>
  );
}
