import { Link } from "react-router";
import "~/public-website.css";

// Der Kopfbereich trägt das Logo als Vektordatei aus public/marke/.
//
// Vorgeschichte: hier stand einmal eine Wortmarke aus Text, weil die abgelegte
// Logodatei beschädigt war (das JPEG hatte SOS vor SOF, die PNG-Fassung eine
// falsche IDAT-Prüfsumme) und kein Browser sie dekodieren konnte. Danach kam
// die stehende Rasterfassung, 377 auf 183 Bildpunkte.
//
// Jetzt liegt die liegende Fassung als Vektor vor. Zwei Gründe für den Tausch:
//
// 1. Die Form. Stehend ist das Logo 2,06 mal so breit wie hoch und macht den
//    Kopfbereich bei 188 Pixeln Breite 91 Pixel hoch. Liegend sind es 3,40 und
//    damit 55 Pixel — dieselbe Marke, ein deutlich ruhigerer Kopf.
//
// 2. Die Vorlage war durch verlustbehaftete Kompression gelaufen. Um den
//    Schriftzug lag ein aufgehellter Block, der auf der Navy-Fläche des Kopfes
//    als schwaches Rechteck sichtbar war. Der Vektor hat ihn nicht.
//
// Die Vektorfassung ist aus der Rastervorlage nachgezeichnet (Farbtrennung in
// die drei Markenfarben, dann potrace), nicht die Originaldatei des Gestalters.
// Bei Kopfgröße ist sie nicht von der Vorlage zu unterscheiden; für Druck oder
// sehr große Anwendungen sollte die Originaldatei besorgt werden.
//
// scripts/check-brand-logo.mjs prüft bei jedem Build, dass die Datei wirklich
// vorhanden ist, die erwarteten Maße trägt und ausschließlich die drei
// Markenfarben verwendet.
const LOGO = "/marke/zeyher-mutter-logo.svg";
const LOGO_BREITE = 565;
const LOGO_HOEHE = 166;

/** Nur das Logo, ohne Kopfbereich — für die interne Veröffentlichungsvorschau. */
export function BrandMark() {
  return <img src={LOGO} alt="Zeyher &amp; Mutter Immobilien München" width={LOGO_BREITE} height={LOGO_HOEHE} />;
}

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link className="public-brand" to="/" aria-label="Zeyher & Mutter Immobilien München – Startseite">
        <img src={LOGO} alt="Zeyher &amp; Mutter Immobilien München" width={LOGO_BREITE} height={LOGO_HOEHE} />
      </Link>
      <nav className="public-nav" aria-label="Hauptnavigation">
        <Link to="/bewertung">Bewertung</Link>
        <Link to="/verkaufsfertig-check">Verkaufsstrategie-Check</Link>
        <Link to="/immobilien">Immobilien</Link>
        <Link to="/referenzen">Referenzen</Link>
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
        <Link to="/bewertung">Bewertung</Link>
        <Link to="/suchauftrag">Suchauftrag</Link>
        <Link to="/verkaufsfertig-check">Verkaufsstrategie-Check</Link>
        <Link to="/referenzen">Referenzen</Link>
        <Link to="/impressum">Impressum</Link>
        <Link to="/datenschutz">Datenschutz</Link>
        <Link className="public-internal-link" to="/login">Intern</Link>
      </div>
    </footer>
  );
}
