import { Link } from "react-router";
import { brandLogoDataUri } from "~/brand-logo-data";
import "~/brand-identity.css";
import "~/public-ci-overrides.css";

function BrandLogo() {
  return (
    <img
      className="public-brand-logo"
      src={brandLogoDataUri}
      width={378}
      height={185}
      alt=""
      aria-hidden="true"
      decoding="async"
    />
  );
}

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link className="public-brand" to="/" aria-label="Zeyher & Mutter Immobilien München – Startseite">
        <BrandLogo />
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
      <span>Zeyher & Mutter · Immobilien · München</span>
      <div>
        <Link to="/verkaufsfertig-check">Verkaufsstrategie-Check</Link>
        <Link to="/impressum">Impressum</Link>
        <Link to="/datenschutz">Datenschutz</Link>
        <Link className="public-internal-link" to="/login">Intern</Link>
      </div>
    </footer>
  );
}
