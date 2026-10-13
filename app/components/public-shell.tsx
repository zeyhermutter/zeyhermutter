import { Link, NavLink } from "react-router";
import { HONIGTOPF_FELD } from "~/lib/public-intake";
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

// Navigation nach Anliegen, nicht nach Seitennamen (13.10.2026): Wer verkaufen
// will, findet "Verkaufen" und "Bewerten"; wer kaufen will, "Immobilien" und
// "Suchauftrag". Kontakt steht als Knopf rechts, immer sichtbar. Auf schmalen
// Bildschirmen klappt die Liste hinter "Menü" auf -- ohne Skript, mit
// <details>; die Leiste lief vorher in drei Zeilen um.
const NAVIGATION: [string, string][] = [
  ["Verkaufen", "/#verkaufen"],
  ["Bewerten", "/bewertung"],
  ["Strategie-Check", "/verkaufsfertig-check"],
  ["Aufmaß", "/technisches-aufmass"],
  ["Immobilien", "/immobilien"],
  ["Suchauftrag", "/suchauftrag"],
  ["Über uns", "/ueber-uns"],
];

function NavigationsLinks() {
  // Ein Sprung auf die Startseite ("/#verkaufen") ist ein Link, kein NavLink:
  // NavLink wuerde ihn auf der ganzen Startseite als aktiv markieren.
  return <>{NAVIGATION.map(([name, pfad]) => pfad.includes("#")
    ? <Link key={pfad} to={pfad}>{name}</Link>
    : <NavLink key={pfad} to={pfad}>{name}</NavLink>)}</>;
}

export function PublicHeader() {
  return (
    <header className="public-header">
      <Link className="public-brand" to="/" aria-label="Zeyher & Mutter Immobilien München – Startseite">
        <img src={LOGO} alt="Zeyher &amp; Mutter Immobilien München" width={LOGO_BREITE} height={LOGO_HOEHE} />
      </Link>
      <nav className="public-nav" aria-label="Hauptnavigation"><NavigationsLinks /></nav>
      <div className="public-header-rechts">
        <Link className="public-header-kontakt" to="/kontakt">Kontakt</Link>
        <details className="public-menu">
          <summary>Menü</summary>
          <nav aria-label="Hauptnavigation (mobil)"><NavigationsLinks /><Link to="/ratgeber">Ratgeber</Link><Link to="/referenzen">Referenzen</Link><Link to="/kontakt">Kontakt</Link></nav>
        </details>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="public-footer">
      <div className="public-footer-marke">
        <strong>Zeyher &amp; Mutter Immobilien</strong>
        <p>Ihr Maklerbüro in München – Verkauf, Bewertung, Aufmaß und Suchauftrag aus einer Hand.</p>
        <Link className="public-footer-kontakt" to="/kontakt">Kontakt aufnehmen →</Link>
      </div>
      <nav aria-label="Für Eigentümer">
        <strong>Für Eigentümer</strong>
        <Link to="/kontakt">Immobilie verkaufen</Link>
        <Link to="/bewertung">Bewertung anfragen</Link>
        <Link to="/verkaufsfertig-check">Verkaufsstrategie-Check</Link>
        <Link to="/technisches-aufmass">Aufmaß &amp; Grundrisse</Link>
        <Link to="/ohne-makler-verkaufen">Ohne Makler verkaufen?</Link>
      </nav>
      <nav aria-label="Für Käufer">
        <strong>Für Käufer</strong>
        <Link to="/immobilien">Aktuelle Immobilien</Link>
        <Link to="/suchauftrag">Suchauftrag anlegen</Link>
      </nav>
      <nav aria-label="Zeyher & Mutter">
        <strong>Zeyher &amp; Mutter</strong>
        <Link to="/ueber-uns">Über uns</Link>
        <Link to="/referenzen">Referenzen</Link>
        <Link to="/ratgeber">Ratgeber</Link>
        <Link to="/kontakt">Kontakt</Link>
      </nav>
      <div className="public-footer-recht">
        <span>© Zeyher &amp; Mutter Immobilien · München</span>
        <span>
          <Link to="/impressum">Impressum</Link>
          <Link to="/datenschutz">Datenschutz</Link>
          <Link to="/widerruf">Widerruf</Link>
          <Link className="public-internal-link" to="/login">Intern</Link>
        </span>
      </div>
    </footer>
  );
}

/**
 * Das versteckte Feld gegen Formular-Roboter — einmal geschrieben, von allen
 * oeffentlichen Formularen verwendet.
 *
 * Es stand frueher fuenfmal kopiert im Markup, jedes Mal als `company` mit der
 * Beschriftung „Firma“. Chrome hat es deshalb als Firmenfeld ausgefuellt und
 * echte Anfragen sind still verschwunden. Die Begruendung fuer Name und
 * Beschriftung steht bei HONIGTOPF_FELD in app/lib/public-intake.ts.
 */
export function Honigtopf() {
  return (
    <label className="public-honeypot" aria-hidden="true">
      <span>Zusatzangabe</span>
      <input name={HONIGTOPF_FELD} tabIndex={-1} autoComplete="off" />
    </label>
  );
}
