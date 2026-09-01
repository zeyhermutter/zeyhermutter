export type HomepageVariant = {
  id: string;
  name: string;
  kicker: string;
  description: string;
  traits: string[];
};

export const homepageVariants: HomepageVariant[] = [
  {
    id: "1",
    name: "Editorial Klarheit",
    kicker: "Ruhig · hochwertig · markenstark",
    description: "Große Typografie, viel Weißraum und eine klare Entscheidungskette vom Ist-Zustand bis zur Vermarktung.",
    traits: ["Premium-Anmutung", "starke Leitidee", "wenige, klare Botschaften"],
  },
  {
    id: "2",
    name: "Entscheidung zuerst",
    kicker: "Vergleichen · verstehen · entscheiden",
    description: "Stellt die drei möglichen Verkaufswege direkt ins Zentrum und erklärt den Nutzen des Checks über konkrete Entscheidungen.",
    traits: ["sehr erklärend", "Szenarien im Fokus", "hohe CTA-Klarheit"],
  },
  {
    id: "3",
    name: "Der Verkaufsweg",
    kicker: "Prozess · Führung · Sicherheit",
    description: "Erzählt die Leistung als geführten Weg in vier Schritten und macht ZeyherMutter zum Ansprechpartner durch den gesamten Prozess.",
    traits: ["prozessstark", "vertrauensbildend", "klare Reihenfolge"],
  },
  {
    id: "4",
    name: "Wirtschaftlich denken",
    kicker: "Aufwand · Wirkung · Verkaufsperspektive",
    description: "Eine sachlichere, datenorientierte Variante mit Kosten-, Zeit- und Wirkungsperspektive vor der Vermarktung.",
    traits: ["rational", "nutzenorientiert", "wirtschaftliche Abwägung"],
  },
  {
    id: "5",
    name: "Persönlich verkaufen",
    kicker: "Eigentümer · Immobilie · guter Übergang",
    description: "Wärmere Ansprache für Eigentümer, Erbengemeinschaften und Familien mit stärkerem Fokus auf Entlastung und persönliche Begleitung.",
    traits: ["nahbar", "situationsbezogen", "emotionaler Einstieg"],
  },
];

export function getHomepageVariant(id: string | undefined) {
  return homepageVariants.find((variant) => variant.id === id) ?? null;
}
