import { Link } from "react-router";
import "~/brand-identity.css";
import "~/brand-logo.css";

function BrandLogo() {
  return (
    <svg
      className="public-brand-logo"
      viewBox="0 0 1460 320"
      role="img"
      aria-labelledby="brand-logo-title brand-logo-desc"
    >
      <title id="brand-logo-title">Zeyher &amp; Mutter Immobilien</title>
      <desc id="brand-logo-desc">Geometrisches Hausmonogramm in Navy und Gold mit dem Schriftzug Zeyher &amp; Mutter Immobilien.</desc>
      <g transform="translate(24 18)" fill="none" strokeWidth="10" strokeLinecap="square" strokeLinejoin="miter">
        <path className="brand-logo-navy-stroke" d="M32 236V96L139 25L181 54" />
        <path className="brand-logo-gold-stroke" d="M181 54L196 64V46H220V82L251 102V236" />
        <path className="brand-logo-navy-stroke" d="M66 116H159L70 224H162" />
        <path className="brand-logo-gold-stroke" d="M165 137L201 183L237 137V224" />
        <g className="brand-logo-gold-fill" stroke="none">
          <rect x="132" y="182" width="15" height="15" />
          <rect x="153" y="182" width="15" height="15" />
          <rect x="132" y="203" width="15" height="15" />
          <rect x="153" y="203" width="15" height="15" />
        </g>
      </g>
      <line className="brand-logo-gold-stroke" x1="324" y1="70" x2="324" y2="252" strokeWidth="3" />
      <text x="395" y="145" className="brand-logo-wordmark" fontSize="76">
        <tspan className="brand-logo-navy-fill">ZEYHER </tspan>
        <tspan className="brand-logo-gold-fill">&amp;</tspan>
        <tspan className="brand-logo-navy-fill"> MUTTER</tspan>
      </text>
      <line className="brand-logo-gold-stroke" x1="398" y1="207" x2="548" y2="207" strokeWidth="3" />
      <text x="585" y="218" className="brand-logo-descriptor" fontSize="27">IMMOBILIEN</text>
      <line className="brand-logo-gold-stroke" x1="1135" y1="207" x2="1328" y2="207" strokeWidth="3" />
    </svg>
  );
}

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link className="public-brand" to="/" aria-label="Zeyher & Mutter Immobilien – Startseite">
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
