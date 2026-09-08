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
