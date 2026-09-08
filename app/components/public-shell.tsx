import { Link } from "react-router";
import "~/public-website.css";

// Der Kopfbereich trägt das Logo als Bilddatei aus public/marke/.
//
// Vorher stand hier eine Wortmarke aus Text: die im Repository abgelegte
// Logodatei war beschädigt (das JPEG hatte SOS vor SOF, die PNG-Fassung eine
// falsche IDAT-Prüfsumme), kein Browser konnte sie dekodieren, und im Kopf
// stand das Symbol für ein kaputtes Bild. Statt ein Logo zu erfinden stand
// dort der Name in der Hausschrift.
//
// Jetzt liegt die Originaldatei vor. Sie wird als Datei ausgeliefert und nicht
// als Data-URI in das Programmbündel eingebettet: so lädt sie der Browser
// einmal und behält sie, statt sie bei jedem Aufruf mitzuschleppen.
//
// Der Navy-Grund der Datei ist auf denselben Wert geglättet wie die Fläche des
// Kopfbereichs (#062037), deshalb ist die Kante des Bildes unsichtbar.
// scripts/check-brand-logo.mjs prüft bei jedem Build, dass die Datei wirklich
// dekodierbar ist und die erwarteten Maße hat.
const LOGO = "/marke/zeyher-mutter-logo.png";

/** Nur das Logo, ohne Kopfbereich — für die interne Veröffentlichungsvorschau. */
export function BrandMark() {
  return <img src={LOGO} alt="Zeyher &amp; Mutter Immobilien München" width={377} height={183} />;
}

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link className="public-brand" to="/" aria-label="Zeyher & Mutter Immobilien München – Startseite">
        <img src={LOGO} alt="Zeyher &amp; Mutter Immobilien München" width={377} height={183} />
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
      <span>Zeyher &amp; Mutter · Immobilien · München</span>
      <div>
        <Link to="/verkaufsfertig-check">Verkaufsstrategie-Check</Link>
        <Link to="/impressum">Impressum</Link>
        <Link to="/datenschutz">Datenschutz</Link>
        <Link className="public-internal-link" to="/login">Intern</Link>
      </div>
    </footer>
  );
}
