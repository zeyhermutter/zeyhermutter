// Werte und Beschriftungen fuer das Feedback nach einer Besichtigung
// (27.10.2026). Dieselben Schluessel stehen in der Datenbank
// (viewing_feedback, viewing_feedback_links) als Pruefregel.

/** Interesse, wie der Makler es einschaetzt. */
export const INTERESSE: [string, string][] = [
  ["VERY_HIGH", "Sehr hoch"],
  ["HIGH", "Hoch"],
  ["MEDIUM", "Mittel"],
  ["LOW", "Gering"],
  ["NONE", "Kein Interesse"],
];

/** Dieselben Stufen, wie der Interessent sie im Formular liest. */
export const INTERESSE_KUNDE: [string, string][] = [
  ["VERY_HIGH", "Sehr gut"],
  ["HIGH", "Gut"],
  ["MEDIUM", "Geht so"],
  ["LOW", "Eher nicht"],
  ["NONE", "Gar nicht"],
];

export const PREISEINSCHAETZUNG: [string, string][] = [
  ["FAIR", "angemessen"],
  ["HIGH", "eher hoch"],
  ["TOO_HIGH", "zu hoch"],
];

export const ABSAGEGRUND: [string, string][] = [
  ["LOCATION", "Lage"],
  ["PRICE", "Preis"],
  ["SIZE_LAYOUT", "Größe oder Grundriss"],
  ["CONDITION", "Zustand"],
  ["EQUIPMENT", "Ausstattung"],
  ["FINANCING", "Finanzierung"],
  ["OTHER_PROPERTY", "Andere Immobilie gefunden"],
  ["OTHER", "Sonstiges"],
];

/** Wunsch des Interessenten; der erste Eintrag haengt an Kauf oder Miete. */
export function wunschListe(vermarktung: string | null | undefined): [string, string][] {
  return [
    ["OFFER", vermarktung === "RENT" ? "Ich möchte die Immobilie mieten" : "Ich möchte ein Kaufangebot abgeben"],
    ["SECOND_VIEWING", "Ich möchte eine zweite Besichtigung"],
    ["DOCUMENTS", "Ich brauche weitere Unterlagen"],
    ["THINKING", "Ich überlege noch"],
    ["NO_INTEREST", "Kein Interesse"],
  ];
}

export const WUNSCH_KURZ: [string, string][] = [
  ["OFFER", "Angebot / Zusage"],
  ["SECOND_VIEWING", "Zweite Besichtigung"],
  ["DOCUMENTS", "Weitere Unterlagen"],
  ["THINKING", "Überlegt noch"],
  ["NO_INTEREST", "Kein Interesse"],
];

export function beschriftung(liste: [string, string][], wert: string | null | undefined): string {
  if (!wert) return "—";
  return liste.find(([k]) => k === wert)?.[1] ?? wert;
}

export const SCHLUESSEL = {
  interesse: new Set(INTERESSE.map(([k]) => k)),
  preis: new Set(PREISEINSCHAETZUNG.map(([k]) => k)),
  grund: new Set(ABSAGEGRUND.map(([k]) => k)),
  wunsch: new Set(WUNSCH_KURZ.map(([k]) => k)),
};
