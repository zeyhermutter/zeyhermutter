import { Link } from "react-router";

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link className="public-brand" to="/" aria-label="ZeyherMutter Startseite">
        <span aria-hidden="true">ZM</span><strong>ZeyherMutter</strong>
      </Link>
      <nav className="public-nav" aria-label="Hauptnavigation">
        <Link to="/verkaufsfertig-check">Verkaufsstrategie-Check</Link>
        <Link to="/immobilien">Immobilien</Link>
        <Link to="/kontakt">Kontakt</Link>
      </nav>
    </header>
  );
}
export function PublicFooter() {
  return (
    <footer className="public-footer">
      <span>ZeyherMutter · Immobilienvermittlung</span>
      <div>
        <Link to="/verkaufsfertig-check">Verkaufsstrategie-Check</Link>
        <Link to="/impressum">Impressum</Link>
        <Link to="/datenschutz">Datenschutz</Link>
        <Link className="public-internal-link" to="/login">Intern</Link>
      </div>
    </footer>
  );
}
