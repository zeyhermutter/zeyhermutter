import { Form, Link, useLocation } from "react-router";
import type { ReactNode } from "react";
import { NotificationBell, type HeaderNotification } from "~/components/notification-bell";
import { Schnellsuche } from "~/components/schnellsuche";
import { vergissZuletzt } from "~/lib/zuletzt-geoeffnet";
import { BEREICHE, bereichAusPfad, emailZiel, type Bereichsschluessel } from "~/lib/programmbereiche";
import "~/programmrahmen.css";
import "~/programmansicht.css";
import "~/programmfarben.css";

declare const __BUILD_COMMIT__: string;

// Der Rahmen um jede interne Seite -- wie ein Arbeitsprogramm, nicht wie eine
// Webseite.
//
//   Titelleiste     Marke, Suche, Glocke, Umgebung, Benutzer
//   Modulleiste     sechs Bereiche, darunter abgesetzt die Verwaltung
//   Bereichsleiste  die Unterpunkte des gewaehlten Bereichs als Reiter
//   Statusleiste    wo man ist und als wer
//
// Er ersetzt den Seitenstreifen mit 31 gleichrangigen Eintraegen. Welche
// Unterpunkte zu welchem Bereich gehoeren, steht in app/lib/programmbereiche.ts.
//
// Die Klassen persistent-app-frame und persistent-app-main bleiben: an ihnen
// haengt das helle Erscheinungsbild (crm-light-theme.css) und die Breiten-
// und Abstandspruefungen. Ein Umbau des Rahmens soll keine Seite darin
// umfaerben.

const SYMBOLE: Record<Bereichsschluessel, ReactNode> = {
  tag: <><rect x="3.5" y="5" width="17" height="15" rx="2" /><path d="M3.5 10h17M8 3v4M16 3v4" /></>,
  adressen: <><circle cx="9" cy="8.5" r="3.5" /><path d="M3 19c.8-3.2 3.2-5 6-5s5.2 1.8 6 5" /><path d="M16 5.5a3.2 3.2 0 0 1 0 6M18.5 14.5c1.3.8 2.1 2.3 2.5 4.5" /></>,
  immobilien: <><path d="M3.5 11 12 4l8.5 7" /><path d="M5.5 9.5V20h13V9.5" /><path d="M10 20v-5h4v5" /></>,
  vermarktung: <><path d="M4 10v4h3l6 4V6l-6 4H4Z" /><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11" /></>,
  abschluss: <><path d="M6 3.5h9l3.5 3.5v13.5H6Z" /><path d="M14.5 3.5v4h4" /><path d="m9 13.5 2.2 2.2 4.3-4.2" /></>,
  auswertung: <><path d="M4 20h16" /><rect x="6" y="11" width="3" height="7" /><rect x="11" y="7" width="3" height="11" /><rect x="16" y="13" width="3" height="5" /></>,
  verwaltung: <><circle cx="12" cy="12" r="3" /><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7" /></>,
};

function Symbol({ schluessel }: { schluessel: Bereichsschluessel }) {
  return (
    <svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      {SYMBOLE[schluessel]}
    </svg>
  );
}

export function Programmrahmen({ children, notifications, unreadCount, benutzer, hilfe }: {
  children: ReactNode;
  /** Der Hilfe-Knopf -- steht in der Titelleiste, nicht schwebend ueber der Seite. */
  hilfe?: ReactNode;
  notifications?: HeaderNotification[];
  unreadCount?: number;
  benutzer?: string | null;
}) {
  const { pathname } = useLocation();
  const { bereich, unterpunkt } = bereichAusPfad(pathname);
  const hauptbereiche = BEREICHE.filter((b) => b.schluessel !== "verwaltung");
  const verwaltung = BEREICHE.find((b) => b.schluessel === "verwaltung")!;

  const modul = (b: typeof bereich) => {
    const aktiv = b.schluessel === bereich.schluessel;
    return (
      <Link
        key={b.schluessel}
        to={b.start}
        data-bereich={b.schluessel}
        className={`modulleiste-eintrag${aktiv ? " aktiv" : ""}`}
        aria-current={aktiv ? "true" : undefined}
      >
        <Symbol schluessel={b.schluessel} />
        <span>{b.beschriftung}</span>
      </Link>
    );
  };

  return (
    <div className="persistent-app-frame programmrahmen" data-bereich={bereich.schluessel}>
      <header className="titelleiste">
        <Link className="titelleiste-marke" to="/crm" aria-label="Zur Übersicht">
          <span className="titelleiste-zeichen" aria-hidden="true">ZM</span>
          <span>ZeyherMutterOS</span>
        </Link>

        {/* Schnellsuche mit Strg+K (P2-2); ohne JavaScript ein Formular auf /crm/search. */}
        <Schnellsuche />

        <div className="titelleiste-rechts">
          {hilfe}
          {notifications
            ? <NotificationBell notifications={notifications} unreadCount={unreadCount ?? 0} />
            : <Link className="titelleiste-glocke" to="/crm/notifications" aria-label="Benachrichtigungen">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></svg>
              </Link>}
          <span className="titelleiste-umgebung">{__APP_ENV_LABEL__}</span>
          {benutzer ? <span className="titelleiste-benutzer">{benutzer}</span> : null}
          <Form method="post" action="/logout" onSubmit={vergissZuletzt}>
            <button className="titelleiste-abmelden" type="submit">Abmelden</button>
          </Form>
        </div>
      </header>

      <nav className="modulleiste" aria-label="Bereiche">
        {hauptbereiche.map(modul)}
        <span className="modulleiste-trenner" aria-hidden="true" />
        {modul(verwaltung)}
      </nav>

      <div className="programm-arbeitsflaeche">
        <nav className="bereichsleiste" aria-label={`Unterpunkte ${bereich.beschriftung}`}>
          <strong className="bereichsleiste-titel"><Symbol schluessel={bereich.schluessel} />{bereich.beschriftung}</strong>
          <div className="bereichsleiste-reiter">
            {bereich.unterpunkte.map((u) => {
              const aktiv = unterpunkt?.pfad === u.pfad;
              const ziel = u.pfad === "/crm/email" ? emailZiel(pathname) : u.pfad;
              return (
                <Link key={u.pfad} to={ziel} className={`bereichsleiste-eintrag${aktiv ? " aktiv" : ""}`} aria-current={aktiv ? "page" : undefined}>
                  {u.beschriftung}
                </Link>
              );
            })}
          </div>
        </nav>

        <div className="persistent-app-main">{children}</div>

        <footer className="statusleiste">
          <span>{bereich.beschriftung}{unterpunkt ? ` › ${unterpunkt.beschriftung}` : ""}</span>
          <span className="statusleiste-rechts">{__APP_ENV_LABEL__}{benutzer ? ` · angemeldet als ${benutzer}` : ""}</span>
          {/* Der Build-Stempel stand schwebend unten rechts und lag ueber
              Knoepfen und Tabellenspalten (BETA, 13.10.2026). */}
          <span className="statusleiste-stand" title="Git-Commit des ausgelieferten Builds">Stand {__BUILD_COMMIT__}</span>
        </footer>
      </div>
    </div>
  );
}
