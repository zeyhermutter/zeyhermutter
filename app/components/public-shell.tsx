import { Link } from "react-router";
import "~/brand-identity.css";

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link className="public-brand" to="/" aria-label="Zeyher & Mutter Immobilien – Startseite">
        <img
          className="public-brand-logo"
          src="/zeyher-mutter-immobilien.svg"
          alt="Zeyher & Mutter Immobilien"
          width="1460"
          height="320"
        />
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
      <span>Zeyher & Mutter · Immobilien</span>
      <div>
        <Link to="/verkaufsfertig-check">Verkaufsstrategie-Check</Link>
        <Link to="/impressum">Impressum</Link>
        <Link to="/datenschutz">Datenschutz</Link>
        <Link className="public-internal-link" to="/login">Intern</Link>
      </div>
    </footer>
  );
}
