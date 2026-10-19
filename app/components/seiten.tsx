import { Link, useLocation } from "react-router";

// Blaettern unter einer Programmliste. Behaelt alle Filter der Adresse und
// tauscht nur die Seite. Gleiches Aussehen wie bei Kontakten und Objekten.
export function Seiten({ page, pageCount }: { page: number; pageCount: number }) {
  const { search } = useLocation();
  if (pageCount <= 1) return null;
  const href = (n: number) => {
    const p = new URLSearchParams(search);
    p.set("page", String(n));
    return `?${p.toString()}`;
  };
  return (
    <nav className="programm-liste-seiten" aria-label="Seiten">
      {page > 1 ? <Link to={href(page - 1)}>← Zurück</Link> : <span />}
      <span>Seite {page} von {pageCount}</span>
      {page < pageCount ? <Link to={href(page + 1)}>Weiter →</Link> : <span />}
    </nav>
  );
}

/** Hinweis, wenn ein Suchwort zu viele Kontakte oder Objekte trifft. */
export function SucheZuAllgemein({ an }: { an: boolean }) {
  return an ? <p className="programm-liste-leer">Das Suchwort passt auf sehr viele Kontakte oder Objekte – berücksichtigt sind die 100 zuletzt geänderten. Bitte genauer suchen.</p> : null;
}
