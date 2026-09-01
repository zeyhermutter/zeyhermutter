export type WebsitePageKey = "HOME" | "CONTACT" | "IMPRINT" | "PRIVACY";
export type WebsiteContent = Record<string, string>;
export type WebsiteFieldDefinition = { key: string; label: string; multiline?: boolean; rows?: number };

export const WEBSITE_PAGE_DEFINITIONS: Record<WebsitePageKey, { label: string; path: string; fields: WebsiteFieldDefinition[] }> = {
  HOME: {
    label: "Startseite",
    path: "/",
    fields: [
      { key: "hero_eyebrow", label: "Hero · Eyebrow" },
      { key: "hero_title", label: "Hero · Überschrift", multiline: true, rows: 2 },
      { key: "hero_lead", label: "Hero · Einleitung", multiline: true, rows: 4 },
      { key: "primary_cta_label", label: "Hero · Hauptbutton" },
      { key: "secondary_cta_label", label: "Hero · Check-Button" },
      { key: "property_cta_label", label: "Hero · Immobilien-Link" },
      { key: "choice_eyebrow", label: "Wege · Eyebrow" },
      { key: "choice_title", label: "Wege · Überschrift", multiline: true, rows: 2 },
      { key: "choice_body", label: "Wege · Einleitung", multiline: true, rows: 4 },
      { key: "primary_title", label: "Maklerleistung · Überschrift", multiline: true, rows: 2 },
      { key: "primary_body", label: "Maklerleistung · Text", multiline: true, rows: 4 },
      { key: "primary_link_label", label: "Maklerleistung · Link" },
      { key: "secondary_title", label: "Verkaufsstrategie-Check · Überschrift" },
      { key: "secondary_body", label: "Verkaufsstrategie-Check · Text", multiline: true, rows: 4 },
      { key: "secondary_link_label", label: "Verkaufsstrategie-Check · Link" },
      { key: "services_eyebrow", label: "Leistungen · Eyebrow" },
      { key: "services_title", label: "Leistungen · Überschrift", multiline: true, rows: 2 },
      { key: "service_1_title", label: "Leistung 1 · Titel" },
      { key: "service_1_body", label: "Leistung 1 · Text", multiline: true, rows: 3 },
      { key: "service_2_title", label: "Leistung 2 · Titel" },
      { key: "service_2_body", label: "Leistung 2 · Text", multiline: true, rows: 3 },
      { key: "service_3_title", label: "Leistung 3 · Titel" },
      { key: "service_3_body", label: "Leistung 3 · Text", multiline: true, rows: 3 },
      { key: "check_eyebrow", label: "Check · Eyebrow" },
      { key: "check_title", label: "Check · Überschrift", multiline: true, rows: 2 },
      { key: "check_body", label: "Check · Text", multiline: true, rows: 4 },
      { key: "check_point_a", label: "Check · Option A" },
      { key: "check_point_b", label: "Check · Option B" },
      { key: "check_point_c", label: "Check · Option C" },
      { key: "check_link_label", label: "Check · Link" },
      { key: "trust_quote", label: "Vertrauen · Zitat", multiline: true, rows: 3 },
      { key: "trust_body", label: "Vertrauen · Text", multiline: true, rows: 4 },
      { key: "cta_eyebrow", label: "Abschluss · Eyebrow" },
      { key: "cta_title", label: "Abschluss · Überschrift", multiline: true, rows: 2 },
      { key: "cta_primary_label", label: "Abschluss · Hauptbutton" },
      { key: "cta_secondary_label", label: "Abschluss · Check-Button" },
    ],
  },
  CONTACT: {
    label: "Kontakt",
    path: "/kontakt",
    fields: [
      { key: "eyebrow", label: "Eyebrow" },
      { key: "title", label: "Überschrift" },
      { key: "lead", label: "Einleitung", multiline: true, rows: 4 },
      { key: "personal_eyebrow", label: "Persönlich · Eyebrow" },
      { key: "personal_title", label: "Persönlich · Überschrift" },
      { key: "personal_body", label: "Persönlich · Text", multiline: true, rows: 4 },
      { key: "consent_text", label: "Einwilligung am Formular", multiline: true, rows: 3 },
      { key: "submit_label", label: "Absende-Button" },
      { key: "success_title", label: "Erfolg · Überschrift" },
      { key: "success_text", label: "Erfolg · Text", multiline: true, rows: 3 },
    ],
  },
  IMPRINT: {
    label: "Impressum",
    path: "/impressum",
    fields: [
      { key: "eyebrow", label: "Eyebrow" },
      { key: "title", label: "Überschrift" },
      { key: "notice_title", label: "Hinweis · Überschrift" },
      { key: "body", label: "Inhalt", multiline: true, rows: 12 },
    ],
  },
  PRIVACY: {
    label: "Datenschutz",
    path: "/datenschutz",
    fields: [
      { key: "eyebrow", label: "Eyebrow" },
      { key: "title", label: "Überschrift" },
      { key: "notice_title", label: "Hinweis · Überschrift" },
      { key: "body", label: "Inhalt", multiline: true, rows: 12 },
      { key: "note_title", label: "Zusatzhinweis · Überschrift" },
      { key: "note_body", label: "Zusatzhinweis · Text", multiline: true, rows: 5 },
    ],
  },
};

export const DEFAULT_WEBSITE_CONTENT: Record<WebsitePageKey, WebsiteContent> = {
  HOME: {
    hero_eyebrow: "Zeyher & Mutter · Immobilien",
    hero_title: "Immobilien verkaufen. Persönlich begleitet, professionell vermarktet.",
    hero_lead: "Wir begleiten Eigentümer vom ersten Gespräch bis zum erfolgreichen Abschluss: mit realistischer Einordnung, klarer Positionierung, hochwertiger Vermarktung und persönlicher Betreuung.",
    primary_cta_label: "Immobilie verkaufen",
    secondary_cta_label: "Verkaufsstrategie-Check",
    property_cta_label: "Immobilien ansehen →",
    choice_eyebrow: "Zwei Wege zu uns",
    choice_title: "Sie möchten verkaufen. Wir steigen dort ein, wo Sie gerade stehen.",
    choice_body: "Für die meisten Eigentümer beginnt die Zusammenarbeit klassisch mit der Immobilienvermittlung. Wenn vor dem Marktstart noch offen ist, ob und welche Vorbereitung sinnvoll ist, ergänzt der Verkaufsstrategie-Check unseren Maklerprozess.",
    primary_title: "Klassische Maklerleistung aus einer Hand.",
    primary_body: "Einordnung, Positionierung, Exposé, Vermarktung, Interessentenmanagement, Besichtigungen, Verhandlung und Begleitung bis zum Abschluss.",
    primary_link_label: "Verkaufsgespräch anfragen →",
    secondary_title: "Verkaufsstrategie-Check",
    secondary_body: "Wenn Zustand, Maßnahmen oder Investitionen vor dem Verkauf unklar sind, vergleichen wir Ist-Zustand, gezielte Aufbereitung und größere Maßnahmen.",
    secondary_link_label: "Verkaufsstrategie-Check ansehen →",
    services_eyebrow: "Unsere Maklerleistung",
    services_title: "Ein klarer Verkaufsprozess – professionell geführt.",
    service_1_title: "Bewerten & positionieren",
    service_1_body: "Immobilie, Zielgruppe und Ausgangslage einordnen und daraus eine schlüssige Vermarktungsstrategie entwickeln.",
    service_2_title: "Präsentieren & vermarkten",
    service_2_body: "Unterlagen, Aufbereitung, Darstellung und Vermarktungskanäle zu einem professionellen Marktauftritt zusammenführen.",
    service_3_title: "Interessenten & Abschluss",
    service_3_body: "Anfragen qualifizieren, Besichtigungen koordinieren, Verhandlungen begleiten und den Verkaufsprozess strukturiert weiterführen.",
    check_eyebrow: "Wenn vor dem Verkauf noch Fragen offen sind",
    check_title: "Erst klären, was die Immobilie braucht. Dann klassisch vermarkten.",
    check_body: "Der Verkaufsstrategie-Check ist kein Ersatz für unsere Maklerleistung, sondern eine zusätzliche Option davor. Er hilft bei der Entscheidung, ob die Immobilie direkt in den Markt gehen sollte oder ob ausgewählte Maßnahmen sinnvoll erscheinen.",
    check_point_a: "Im Ist-Zustand verkaufen",
    check_point_b: "Gezielt aufbereiten",
    check_point_c: "Erweiterte Maßnahmen prüfen",
    check_link_label: "Verkaufsstrategie-Check öffnen →",
    trust_quote: "Eine gute Vermarktung beginnt mit einem klaren Blick auf die Immobilie – und mit einem Makler, der den gesamten Weg weiterführt.",
    trust_body: "Klassischer Immobilienverkauf als Kernleistung. Verkaufsstrategie-Check als zusätzliche Entscheidungshilfe, wenn vor dem Marktstart noch Klärungsbedarf besteht.",
    cta_eyebrow: "Wie möchten Sie starten?",
    cta_title: "Direkt verkaufen oder vorher den Verkaufsweg prüfen.",
    cta_primary_label: "Immobilie verkaufen",
    cta_secondary_label: "Verkaufsstrategie-Check",
  },
  CONTACT: {
    eyebrow: "Kontakt",
    title: "Wie können wir helfen?",
    lead: "Schreiben Sie uns zu Verkauf, Vermietung, Bewertung oder Ihrer Immobiliensuche. Ihre Nachricht landet direkt im ZeyherMutter CRM.",
    personal_eyebrow: "Persönlich",
    personal_title: "Jochen & Sebastian",
    personal_body: "Ihre Anfrage wird intern als normaler CRM-Vorgang erfasst und von uns persönlich bearbeitet.",
    consent_text: "Ich stimme zu, dass meine Angaben zur Bearbeitung dieser Anfrage gespeichert und verarbeitet werden. *",
    submit_label: "Nachricht senden",
    success_title: "Vielen Dank.",
    success_text: "Ihre Nachricht wurde übermittelt. Wir melden uns bei Ihnen.",
  },
  IMPRINT: {
    eyebrow: "Rechtliches",
    title: "Impressum",
    notice_title: "Finaler Inhalt noch zu hinterlegen.",
    body: "Die technische Seite ist vorbereitet. Unternehmensform, ladungsfähige Anschrift, Vertretungsberechtigte, Registerangaben, Aufsichtsbehörde und weitere Pflichtangaben werden erst eingetragen, wenn die verbindlichen Daten vorliegen. Es werden keine Angaben erfunden.",
  },
  PRIVACY: {
    eyebrow: "Rechtliches",
    title: "Datenschutz",
    notice_title: "Finaler Datenschutztext noch zu hinterlegen.",
    body: "Die Seite ist technisch vorbereitet. Der endgültige Text muss die tatsächlich eingesetzten Dienste, Verantwortlichen, Rechtsgrundlagen, Speicherfristen und Betroffenenrechte korrekt abbilden. Bis diese Angaben verbindlich vorliegen, werden keine juristischen Inhalte erfunden.",
    note_title: "Kontaktformulare in BETA",
    note_body: "Formulare sind technisch an das bestehende CRM-Anfragesystem angebunden. Die endgültige Datenschutzerklärung muss diesen Verarbeitungsvorgang vor einer produktiven Veröffentlichung ausdrücklich beschreiben.",
  },
};

export function isWebsitePageKey(value: string): value is WebsitePageKey {
  return value === "HOME" || value === "CONTACT" || value === "IMPRINT" || value === "PRIVACY";
}

export function normalizeWebsiteContent(pageKey: WebsitePageKey, raw: unknown): WebsiteContent {
  const base = DEFAULT_WEBSITE_CONTENT[pageKey];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...base };
  const result: WebsiteContent = { ...base };
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") result[key] = value;
  }
  return result;
}
