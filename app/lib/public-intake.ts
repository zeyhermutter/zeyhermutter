// Werte, die Formular und Auswertung teilen.
//
// Getrennt von public-intake.server.ts, weil die Auswahlliste in der
// Darstellung gebraucht wird und damit im Browser landet. Ein ".server"-Modul
// darf das nicht -- der Build weist es zu Recht ab.

/** Die Immobilienarten, die die Edge-Funktion annimmt. Reihenfolge wie im Formular. */
export const IMMOBILIENARTEN: [string, string][] = [
  ["DETACHED_HOUSE", "Einfamilienhaus"],
  ["SEMI_DETACHED_HOUSE", "Doppelhaushälfte"],
  ["TERRACED_HOUSE", "Reihenhaus"],
  ["APARTMENT", "Wohnung"],
  ["PENTHOUSE", "Penthouse"],
  ["MAISONETTE", "Maisonette"],
  ["APARTMENT_BUILDING", "Mehrfamilienhaus"],
  ["LAND", "Grundstück"],
  ["COMMERCIAL", "Gewerbeimmobilie"],
  ["OFFICE", "Büro"],
  ["RETAIL", "Ladenfläche"],
  ["OTHER", "Sonstiges"],
];

export const IMMOBILIENARTEN_SCHLUESSEL = new Set(IMMOBILIENARTEN.map(([key]) => key));

/** Kauf oder Miete — die beiden Werte, die search_profiles.transaction_type kennt. */
export const ART_DER_SUCHE: [string, string][] = [["BUY", "Kaufen"], ["RENT", "Mieten"]];

export const ZUSTAENDE = ["Gepflegt", "Leicht renovierungsbedürftig", "Deutlich renovierungsbedürftig", "Sanierungsbedürftig", "Noch unklar"];
export const ZEITRAEUME = ["So bald wie möglich", "In 3 bis 6 Monaten", "In 6 bis 12 Monaten", "Später / noch offen"];

// --- Honigtopf ------------------------------------------------------------
//
// Das versteckte Feld gegen Formular-Roboter. Ist es ausgefuellt, meldet die
// Seite Erfolg und schreibt nichts.
//
// WARUM DER NAME HIER STEHT UND NICHT FUENFMAL IM MARKUP
//
// Das Feld hiess einmal "company" und trug die Beschriftung "Firma". Versteckt
// war es nur fuer Menschen: es stand 10.000 Bildpunkte links ausserhalb des
// Bildes, blieb aber display:block und visibility:visible. Fuer Chrome war es
// damit ein ganz normales Eingabefeld -- und "company" plus "Firma" ist genau
// das Muster, an dem Chrome das Feld ORGANISATION aus dem gespeicherten
// Adressprofil erkennt. autocomplete="off" ignoriert Chrome dabei.
//
// Folge: wer beim Vornamen einmal einen Autofill-Vorschlag annahm, bekam Name,
// E-Mail, Telefon, PLZ, Ort UND die Firma eingetragen -- und war fuer die Seite
// ein Roboter. Die Seite meldete Erfolg, die Anfrage war weg. Nachgewiesen am
// 08.09.2026 auf BETA: Formular abgeschickt, Erfolgsmeldung da, kein Lead, kein
// Kontakt, nicht einmal ein Aufruf der Edge-Funktion in den Protokollen.
//
// Zwei Vorkehrungen, unabhaengig voneinander:
//
// 1. Der Feldname und die Beschriftung treffen kein Muster, das ein Browser
//    ausfuellen will. scripts/check-honigtopf.mjs prueft das bei jedem Build.
// 2. .public-honeypot ist display:none. Kein Browser fuellt ein Feld aus, das
//    nicht dargestellt wird. Roboter, die kein CSS auswerten, sehen es weiter.
//
/** Feldname des Honigtopfs. Absichtlich nichts, was ein Browser ausfuellen will. */
export const HONIGTOPF_FELD = "zusatzangabe";
