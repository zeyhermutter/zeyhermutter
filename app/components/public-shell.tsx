import { Link } from "react-router";
import "~/brand-identity.css";
import "~/public-ci-overrides.css";

// Die eingebettete Logodatei im Repository ist beschädigt: das ausgelieferte
// JPEG hat SOS vor SOF, die daneben liegende PNG-Fassung eine falsche
// IDAT-Prüfsumme. Kein Browser konnte das Bild dekodieren, im Kopfbereich stand
// deshalb das Symbol für ein kaputtes Bild. Bis die Originaldatei vorliegt
// steht hier die Wortmarke in der Hausschrift — kein erfundenes Logo, sondern
// der Name in Cormorant Garamond und Montserrat.
// scripts/check-brand-logo.mjs prüft die Bilddaten jetzt wirklich; sobald eine
// intakte Datei eingebunden ist, kann die Wortmarke wieder durch das Bild
// ersetzt werden.
function BrandWordmark() {
  return (
    <span className="public-brand-wordmark">
      <span className="public-brand-wordmark-name">Zeyher &amp; Mutter</span>
      <span className="public-brand-wordmark-kind">Immobilien · München</span>
    </span>
  );
}

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link className="public-brand" to="/" aria-label="Zeyher & Mutter Immobilien München – Startseite">
        <BrandWordmark />
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
