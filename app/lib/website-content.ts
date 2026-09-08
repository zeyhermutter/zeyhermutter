export type WebsitePageKey =
  | "HOME" | "CONTACT" | "IMPRINT" | "PRIVACY" | "ABOUT" | "WITHDRAWAL" | "PRIVATE_SALE"
  | "GUIDE" | "GUIDE_INHERITANCE" | "GUIDE_DIVORCE" | "GUIDE_AGE" | "GUIDE_ENERGY";

/** Die vier Anlassseiten des Ratgebers, in der Reihenfolge der Übersicht. */
export const RATGEBER_SEITEN = ["GUIDE_INHERITANCE", "GUIDE_DIVORCE", "GUIDE_AGE", "GUIDE_ENERGY"] as const;
export type RatgeberSeite = (typeof RATGEBER_SEITEN)[number];
export type WebsiteContent = Record<string, string>;
export type WebsiteFieldDefinition = { key: string; label: string; multiline?: boolean; rows?: number };

// Alle vier Anlassseiten teilen denselben Aufbau. Vier eigene Feldlisten
// waeren viermal Gelegenheit, dass sie sich auseinanderentwickeln.
const RATGEBER_FELDER: WebsiteFieldDefinition[] = [
  { key: "eyebrow", label: "Eyebrow" },
  { key: "title", label: "Überschrift", multiline: true, rows: 2 },
  { key: "lead", label: "Einleitung", multiline: true, rows: 4 },
  { key: "situation_title", label: "Ausgangslage · Überschrift", multiline: true, rows: 2 },
  { key: "situation_body", label: "Ausgangslage · Text", multiline: true, rows: 8 },
  { key: "effects_title", label: "Für den Verkauf · Überschrift", multiline: true, rows: 2 },
  { key: "effect_1", label: "Für den Verkauf · Punkt 1", multiline: true, rows: 4 },
  { key: "effect_2", label: "Für den Verkauf · Punkt 2", multiline: true, rows: 4 },
  { key: "effect_3", label: "Für den Verkauf · Punkt 3", multiline: true, rows: 4 },
  { key: "effect_4", label: "Für den Verkauf · Punkt 4", multiline: true, rows: 4 },
  { key: "we_title", label: "Was wir übernehmen · Überschrift" },
  { key: "we_body", label: "Was wir übernehmen · Text", multiline: true, rows: 6 },
  { key: "limits_title", label: "Grenze · Überschrift" },
  { key: "limits_body", label: "Grenze · Text", multiline: true, rows: 6 },
  { key: "cta_title", label: "Abschluss · Überschrift", multiline: true, rows: 2 },
];

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
  ABOUT: {
    label: "Über uns",
    path: "/ueber-uns",
    fields: [
      { key: "eyebrow", label: "Eyebrow" },
      { key: "title", label: "Überschrift", multiline: true, rows: 2 },
      { key: "lead", label: "Einleitung", multiline: true, rows: 4 },
      { key: "story_eyebrow", label: "Haus · Eyebrow" },
      { key: "story_title", label: "Haus · Überschrift", multiline: true, rows: 2 },
      { key: "story_body", label: "Haus · Text", multiline: true, rows: 10 },
      { key: "people_eyebrow", label: "Personen · Eyebrow" },
      { key: "people_title", label: "Personen · Überschrift" },
      { key: "person_1_name", label: "Person 1 · Name" },
      { key: "person_1_role", label: "Person 1 · Rolle" },
      { key: "person_1_body", label: "Person 1 · Text", multiline: true, rows: 5 },
      { key: "person_2_name", label: "Person 2 · Name" },
      { key: "person_2_role", label: "Person 2 · Rolle" },
      { key: "person_2_body", label: "Person 2 · Text", multiline: true, rows: 5 },
      { key: "person_3_name", label: "Person 3 · Name" },
      { key: "person_3_role", label: "Person 3 · Rolle" },
      { key: "person_3_body", label: "Person 3 · Text", multiline: true, rows: 5 },
      { key: "cta_title", label: "Abschluss · Überschrift", multiline: true, rows: 2 },
    ],
  },
  WITHDRAWAL: {
    label: "Widerrufsbelehrung",
    path: "/widerruf",
    fields: [
      { key: "eyebrow", label: "Eyebrow" },
      { key: "title", label: "Überschrift" },
      { key: "notice_title", label: "Hinweis · Überschrift" },
      { key: "body", label: "Inhalt", multiline: true, rows: 16 },
      { key: "note_title", label: "Muster-Widerrufsformular · Überschrift" },
      { key: "note_body", label: "Muster-Widerrufsformular · Text", multiline: true, rows: 12 },
    ],
  },
  GUIDE: {
    label: "Ratgeber · Übersicht",
    path: "/ratgeber",
    fields: [
      { key: "eyebrow", label: "Eyebrow" },
      { key: "title", label: "Überschrift", multiline: true, rows: 2 },
      { key: "lead", label: "Einleitung", multiline: true, rows: 4 },
      { key: "note", label: "Hinweis unter den Karten", multiline: true, rows: 4 },
    ],
  },
  GUIDE_INHERITANCE: { label: "Ratgeber · Geerbte Immobilie", path: "/ratgeber/geerbte-immobilie", fields: RATGEBER_FELDER },
  GUIDE_DIVORCE: { label: "Ratgeber · Trennung", path: "/ratgeber/immobilie-bei-trennung", fields: RATGEBER_FELDER },
  GUIDE_AGE: { label: "Ratgeber · Im Alter", path: "/ratgeber/immobilie-im-alter", fields: RATGEBER_FELDER },
  GUIDE_ENERGY: { label: "Ratgeber · Energieausweis", path: "/ratgeber/energieausweis", fields: RATGEBER_FELDER },
  PRIVATE_SALE: {
    label: "Ohne Makler verkaufen",
    path: "/ohne-makler-verkaufen",
    fields: [
      { key: "eyebrow", label: "Eyebrow" },
      { key: "title", label: "Überschrift", multiline: true, rows: 2 },
      { key: "lead", label: "Einleitung", multiline: true, rows: 4 },
      { key: "for_eyebrow", label: "Dafür · Eyebrow" },
      { key: "for_title", label: "Dafür · Überschrift", multiline: true, rows: 2 },
      { key: "for_1", label: "Dafür · Punkt 1", multiline: true, rows: 3 },
      { key: "for_2", label: "Dafür · Punkt 2", multiline: true, rows: 3 },
      { key: "for_3", label: "Dafür · Punkt 3", multiline: true, rows: 3 },
      { key: "against_eyebrow", label: "Dagegen · Eyebrow" },
      { key: "against_title", label: "Dagegen · Überschrift", multiline: true, rows: 2 },
      { key: "against_1", label: "Dagegen · Punkt 1", multiline: true, rows: 3 },
      { key: "against_2", label: "Dagegen · Punkt 2", multiline: true, rows: 3 },
      { key: "against_3", label: "Dagegen · Punkt 3", multiline: true, rows: 3 },
      { key: "closing_eyebrow", label: "Fazit · Eyebrow" },
      { key: "closing_title", label: "Fazit · Überschrift", multiline: true, rows: 2 },
      { key: "closing_body", label: "Fazit · Text", multiline: true, rows: 6 },
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

  // Über uns: die Seite, die alle fünfzehn untersuchten Makler haben. Der
  // Aufbau steht, der Inhalt nicht — Namen, Werdegang, Qualifikationen und
  // Jahreszahlen kenne ich nicht, und erfundene Angaben über ein Unternehmen
  // sind schlimmer als eine leere Seite. Was hier steht, ist wahr: dass die
  // Angaben fehlen.
  ABOUT: {
    eyebrow: "Über uns",
    title: "Wer hinter Zeyher & Mutter steht.",
    lead: "Diese Seite ist vorbereitet, aber noch nicht gefüllt. Die Angaben über das Unternehmen und die Personen werden im CRM unter Website-CMS eingetragen; erfunden wird hier nichts.",
    story_eyebrow: "Das Haus",
    story_title: "Noch zu hinterlegen.",
    story_body: "An dieser Stelle steht, seit wann es das Büro gibt, wie es entstanden ist und wofür es steht. Der Text wird im CRM eingetragen.",
    people_eyebrow: "Die Personen",
    people_title: "Noch zu hinterlegen.",
    person_1_name: "",
    person_1_role: "",
    person_1_body: "",
    person_2_name: "",
    person_2_role: "",
    person_2_body: "",
    person_3_name: "",
    person_3_role: "",
    person_3_body: "",
    cta_title: "Sprechen wir über Ihre Immobilie.",
  },

  // Widerrufsbelehrung: eine Belehrung ist ein Rechtstext. Die Software
  // erzeugt keine. Die Seite steht, der Text kommt aus der Rechtsberatung.
  WITHDRAWAL: {
    eyebrow: "Rechtliches",
    title: "Widerrufsbelehrung",
    notice_title: "Finaler Inhalt noch zu hinterlegen.",
    body: "Die Seite ist technisch vorbereitet. Die Widerrufsbelehrung ist ein Rechtstext: Fristbeginn, Form, Folgen des Widerrufs und der Umgang mit bereits erbrachten Leistungen hängen davon ab, wie die Verträge im Einzelnen geschlossen werden. Der verbindliche Text wird von der Rechtsberatung erstellt und hier im CRM eingetragen. Es werden keine Formulierungen erfunden.",
    note_title: "Muster-Widerrufsformular",
    note_body: "Auch das Muster-Widerrufsformular gehört zum Rechtstext und wird gemeinsam mit der Belehrung hinterlegt.",
  },

  GUIDE: {
    eyebrow: "Ratgeber",
    title: "Vier Situationen, in denen ein Verkauf anders läuft.",
    lead: "Die meisten Immobilien werden nicht verkauft, weil jemand verkaufen möchte, sondern weil etwas passiert ist. Der Anlass bestimmt, wer entscheidet, welche Unterlagen fehlen und wie schnell es gehen muss.",
    note: "Diese Seiten erklären, was der jeweilige Anlass für den Verkauf bedeutet. Die rechtlichen und steuerlichen Fragen, die dabei fast immer mitlaufen, beantworten Notar, Anwältin und Steuerberater — nicht wir. Wo die Grenze verläuft, steht auf jeder Seite ausdrücklich.",
  },

  // Geerbte Immobilie. Das häufigste und das schwierigste der vier Themen:
  // mehrere Entscheider, unvollständige Unterlagen, ein Haus, das keiner
  // bewohnt, und im Hintergrund Fristen, die niemand gesetzt hat.
  GUIDE_INHERITANCE: {
    eyebrow: "Geerbte Immobilie",
    title: "Wenn mehrere über ein Haus entscheiden müssen.",
    lead: "Eine geerbte Immobilie ist selten nur eine Immobilie. Sie ist meistens auch eine Beziehung zwischen Menschen, die sich über den Zeitpunkt nicht einig sind — und ein Gebäude, das währenddessen leer steht.",
    situation_title: "Wie die Lage typischerweise aussieht",
    situation_body: "Das Haus steht seit Monaten leer. Die Unterlagen liegen bei einer Person, die Schlüssel bei einer anderen, und eine dritte wohnt weit weg. Niemand ist gegen den Verkauf, aber jede Woche vergeht ohne Entscheidung.\n\nDazu kommen laufende Kosten, die weiterlaufen: Grundsteuer, Versicherung, Heizung im Winter, damit nichts einfriert. Ein leerstehendes Haus verliert außerdem schneller an Substanz, als die meisten erwarten.\n\nDas Grundbuch steht in dieser Zeit oft noch auf der verstorbenen Person. Solange die Erben dort nicht eingetragen sind, lässt sich kein Kaufvertrag beurkunden.",
    effects_title: "Was das für den Verkauf bedeutet",
    effect_1: "Verkaufen kann nur, wer im Grundbuch steht. Die Berichtigung des Grundbuchs auf die Erben ist der erste Schritt und dauert je nach Grundbuchamt einige Wochen. Sie sollte laufen, bevor die Vermarktung beginnt — nicht danach.",
    effect_2: "Eine Erbengemeinschaft entscheidet gemeinsam. Über den Verkauf müssen sich alle einig sein. Das ist keine Formalie: Ein einzelner Miterbe, der nicht antwortet, hält das ganze Verfahren an. Wir klären deshalb früh, wer beteiligt ist und wer für wen sprechen darf.",
    effect_3: "Die Unterlagen sind fast nie vollständig. Teilungserklärung, Baugenehmigungen, Nachweise über Modernisierungen, Protokolle der Eigentümerversammlung — vieles davon lag beim Erblasser und ist nicht sortiert. Das zu beschaffen dauert und gehört vor den Marktstart.",
    effect_4: "Der Zustand ist nicht der Zustand von früher. Ein Haus, das jahrelang bewohnt und dann leer war, wird von Käufern anders bewertet als von der Familie, die es kennt. Diese Differenz früh auszusprechen erspart eine lange Vermarktung mit sinkendem Preis.",
    we_title: "Was wir übernehmen",
    we_body: "Wir führen die Unterlagen zusammen und sagen Ihnen, was fehlt und wo es zu beschaffen ist. Wir halten den Kontakt zu allen Beteiligten, damit nicht eine Person alles koordinieren muss. Und wir stellen die realistischen Wege gegenüber — Verkauf im Ist-Zustand oder mit gezielter Vorbereitung — mit Kosten, Zeitbedarf und dem, was sich davon im Preis wiederfindet.",
    limits_title: "Wofür Sie jemand anderen brauchen",
    limits_body: "Erbschein, Testamentsvollstreckung, Erbausschlagung, die Auseinandersetzung einer Erbengemeinschaft und alle Fragen zur Erbschaftsteuer sind Sache von Notariat, Anwaltschaft und Steuerberatung. Wir beraten dazu nicht und geben auch keine Einschätzung ab — wir sagen Ihnen nur, an welcher Stelle des Verkaufs die Antwort gebraucht wird, damit Sie sie rechtzeitig einholen.",
    cta_title: "Sprechen wir über die Immobilie und die Beteiligten.",
  },

  // Trennung. Hier ist der heikelste Punkt nicht die Sache, sondern der
  // Umgangston: zwei Parteien, die einander misstrauen, und ein Makler, der
  // sich nicht auf eine Seite schlagen darf.
  GUIDE_DIVORCE: {
    eyebrow: "Trennung und Scheidung",
    title: "Wenn zwei Menschen dieselbe Immobilie verkaufen.",
    lead: "Bei einer Trennung ist der Verkauf selten das eigentliche Thema. Er ist der Teil, der sich regeln lässt, während anderes noch offen ist — und genau deshalb muss er nachvollziehbar ablaufen.",
    situation_title: "Wie die Lage typischerweise aussieht",
    situation_body: "Beide stehen im Grundbuch, einer wohnt noch im Haus, der andere nicht mehr. Beide wollen wissen, was die Immobilie wert ist, und beide vermuten, dass die Zahl der anderen Seite besser gefällt.\n\nOft läuft parallel ein Kredit weiter, und es ist unklar, wer ihn bedient. Manchmal steht auch die Frage im Raum, ob eine Seite die andere auszahlt statt zu verkaufen.\n\nWas in dieser Situation am meisten stört, ist nicht Uneinigkeit über den Preis, sondern der Verdacht, dass jemand einseitig informiert wird.",
    effects_title: "Was das für den Verkauf bedeutet",
    effect_1: "Verkaufen können nur beide gemeinsam. Stehen beide im Grundbuch, braucht der Kaufvertrag beide Unterschriften. Auch der Maklerauftrag wird deshalb von beiden erteilt — sonst ist er angreifbar.",
    effect_2: "Beide Seiten bekommen dieselben Informationen zur selben Zeit. Wir schreiben Besichtigungsergebnisse, Rückmeldungen und Angebote an beide, ohne Abstufung. Das ist unbequemer als ein Ansprechpartner, aber es ist die einzige Grundlage, auf der später niemand das Ergebnis anzweifelt.",
    effect_3: "Die Einschätzung wird begründet, nicht behauptet. Wir legen offen, welche Vergleichsobjekte wir heranziehen und welche Annahmen dahinterstehen. Eine nachvollziehbare Zahl ist in dieser Lage mehr wert als eine hohe.",
    effect_4: "Der Zeitplan gehört abgestimmt. Wer noch im Haus wohnt, braucht Vorlauf für Besichtigungen und für den Auszug. Das lässt sich regeln — aber nicht, wenn es erst beim ersten Besichtigungstermin zur Sprache kommt.",
    we_title: "Was wir übernehmen",
    we_body: "Wir arbeiten für die Immobilie, nicht für eine der beiden Seiten. Termine, Unterlagen und Rückmeldungen laufen über uns, sodass Sie nicht miteinander verhandeln müssen, um den Verkauf voranzubringen. Auf Wunsch führen wir Besichtigungen ohne Anwesenheit beider Parteien durch.",
    limits_title: "Wofür Sie jemand anderen brauchen",
    limits_body: "Zugewinnausgleich, Nutzungsentschädigung, die Aufteilung des Erlöses, die Behandlung eines laufenden Darlehens und alle steuerlichen Fragen — etwa nach der Spekulationsfrist — gehören zur anwaltlichen und steuerlichen Beratung. Dazu äußern wir uns nicht, auch nicht überschlägig. Wir sagen Ihnen, bis wann eine Antwort vorliegen sollte, damit der Verkauf nicht an ihr hängen bleibt.",
    cta_title: "Sprechen wir zuerst über die Zahlen, dann über den Zeitplan.",
  },

  // Im Alter. Der Anlass, bei dem der Verkauf am wenigsten selbstverständlich
  // ist -- und bei dem ein Makler am ehesten in Versuchung gerät, zu einem
  // Verkauf zu raten, den es nicht braucht.
  GUIDE_AGE: {
    eyebrow: "Immobilie im Alter",
    title: "Wenn das Haus größer ist als der Alltag.",
    lead: "Viele Häuser werden verkauft, weil sie nicht mehr passen: zu viel Fläche, zu viele Treppen, ein Garten, der zur Arbeit geworden ist. Ob der Verkauf der richtige Weg ist, hängt aber von mehr ab als von der Immobilie.",
    situation_title: "Wie die Lage typischerweise aussieht",
    situation_body: "Das Haus ist abbezahlt und seit Jahrzehnten bewohnt. Die Kinder wohnen woanders und haben kein Interesse daran, es zu übernehmen — oder sie haben Interesse, aber nicht alle gleichermaßen.\n\nGleichzeitig ist der Umzug in eine kleinere Wohnung in München oft teurer, als man erwartet. Der Erlös aus dem Haus ist dann nicht nur ein Betrag, sondern die Grundlage für das, was danach kommt.\n\nHäufig steht auch die Frage im Raum, ob man das Haus zu Lebzeiten übertragen sollte statt zu verkaufen.",
    effects_title: "Was das für den Verkauf bedeutet",
    effect_1: "Die Reihenfolge ist entscheidend. Wer verkauft, bevor die neue Wohnung feststeht, gerät unter Zeitdruck. Wir planen den Übergabetermin deshalb von hinten: erst wissen, wohin, dann verkaufen — und im Kaufvertrag den nötigen Vorlauf vereinbaren.",
    effect_2: "Ein lange bewohntes Haus zeigt seine Geschichte. Was über Jahrzehnte gewachsen ist, wirkt auf Käufer selten so wie auf die Bewohner. Wir sagen offen, was das für die Vermarktung bedeutet, und was sich mit überschaubarem Aufwand ändern lässt — und was nicht.",
    effect_3: "Der Bestand an Unterlagen ist der eigentliche Zeitfaktor. Bei Häusern, die seit vierzig Jahren in einer Hand sind, fehlen oft Baugenehmigungen, Nachweise über Anbauten oder der Energieausweis. Das beschafft man vor dem Marktstart, nicht während der Verhandlung.",
    effect_4: "Ein Verkauf ist nicht die einzige Möglichkeit. Wohnrecht, Nießbrauch, Teilverkauf oder Vermietung sind je nach Situation Alternativen. Wir sagen Ihnen, was sie für den späteren Wert und die Verkäuflichkeit bedeuten — und schicken Sie für die Ausgestaltung zu den Fachleuten.",
    we_title: "Was wir übernehmen",
    we_body: "Wir nehmen uns die Zeit für ein Gespräch, das nicht mit einem Auftrag enden muss. Wenn der Verkauf ansteht, koordinieren wir Unterlagen, Besichtigungen und Übergabe so, dass daraus kein Umzug unter Druck wird. Auf Wunsch sprechen wir mit den Kindern gemeinsam.",
    limits_title: "Wofür Sie jemand anderen brauchen",
    limits_body: "Schenkung, vorweggenommene Erbfolge, Nießbrauch, Wohnrecht, Leibrente und ihre steuerlichen Folgen gehören in die Hände von Notariat und Steuerberatung. Wir erklären, wie sich solche Gestaltungen auf die Verkäuflichkeit auswirken, aber wir empfehlen keine davon und rechnen sie auch nicht durch.",
    cta_title: "Erst in Ruhe sprechen. Entscheiden können Sie danach.",
  },

  // Energieausweis. Das einzige der vier Themen mit einer harten Pflicht --
  // und deshalb das, bei dem die Versuchung am groessten ist, Rechtsauskunft
  // zu erteilen. Hier steht bewusst, was zu tun ist, und nicht, was das
  // Gesetz im Einzelnen verlangt.
  GUIDE_ENERGY: {
    eyebrow: "Energieausweis",
    title: "Das Dokument, an dem Inserate scheitern.",
    lead: "Der Energieausweis ist kein Papier für die Ablage. Ohne ihn dürfen zentrale Angaben in einer Anzeige nicht fehlen — und er muss spätestens bei der Besichtigung vorliegen.",
    situation_title: "Wie die Lage typischerweise aussieht",
    situation_body: "Der Ausweis ist abgelaufen, liegt bei den Unterlagen des vorigen Verkaufs oder wurde nie erstellt. Bei Eigentumswohnungen ist er oft Sache der Verwaltung und muss dort erst angefordert werden.\n\nDas fällt meistens genau dann auf, wenn das Exposé fertig ist und die Anzeige online gehen soll. Dann fehlen ein paar Tage bis Wochen — an der Stelle, an der man sie am wenigsten gebrauchen kann.\n\nDazu kommt die Frage, welche Art von Ausweis überhaupt passt: Der Verbrauchsausweis stützt sich auf tatsächliche Verbräuche, der Bedarfsausweis auf eine Berechnung am Gebäude. Beide sind nicht in jedem Fall zulässig.",
    effects_title: "Was das für den Verkauf bedeutet",
    effect_1: "Die Anzeige braucht die Angaben aus dem Ausweis. Art des Ausweises, Energiekennwert, wesentlicher Energieträger, Baujahr und Effizienzklasse gehören in jede Immobilienanzeige. Fehlen sie, ist das ein Mangel der Anzeige — und im Zweifel abmahnfähig.",
    effect_2: "Er gehört an den Anfang, nicht ans Ende. Die Beschaffung dauert je nach Art und Objekt einige Tage bis mehrere Wochen. Wir setzen sie deshalb ganz vorn auf die Unterlagenliste, zusammen mit Grundbuchauszug und Flurkarte.",
    effect_3: "Die Klasse beeinflusst die Nachfrage, nicht nur die Pflicht. Käufer rechnen inzwischen mit Sanierungskosten. Eine schlechte Klasse ist kein Hindernis, aber sie gehört erklärt — mit dem, was tatsächlich am Gebäude gemacht wurde, und nicht mit Beschwichtigung.",
    effect_4: "Bei Wohnungen führt der Weg über die Verwaltung. Der Ausweis wird für das gesamte Gebäude erstellt. Wer eine Eigentumswohnung verkauft, fordert ihn dort an — und braucht dafür Vorlauf, den die Verwaltung bestimmt und nicht der Verkäufer.",
    we_title: "Was wir übernehmen",
    we_body: "Wir prüfen zu Beginn, ob ein gültiger Ausweis vorliegt, und stoßen die Beschaffung an, wenn er fehlt. Die Angaben übernehmen wir unverändert aus dem Ausweis in Exposé und Anzeigen — dort wird nichts gerundet und nichts weggelassen. Was am Gebäude energetisch gemacht wurde, dokumentieren wir mit Belegen, statt es zu behaupten.",
    limits_title: "Wofür Sie jemand anderen brauchen",
    limits_body: "Ausgestellt wird der Ausweis von den dafür berechtigten Stellen, nicht von uns. Welche Ausweisart in Ihrem Fall zulässig ist, welche Pflichten das Gebäudeenergiegesetz im Einzelnen auslöst und welche Folgen ein Verstoß hat, ist eine Rechtsfrage — dazu geben wir keine Auskunft. Für Sanierungsentscheidungen und Förderungen ist die Energieberatung zuständig.",
    cta_title: "Wir prüfen, was fehlt, bevor die Anzeige steht.",
  },

  // Ohne Makler verkaufen: Argumentation, kein Rechtstext und keine Angabe
  // über das Unternehmen. Deshalb hier ausformuliert -- und ausdrücklich mit
  // beiden Seiten, denn eine Seite, die nur die eigene Leistung verteidigt,
  // beantwortet die Frage nicht, die jemand tatsächlich hat.
  PRIVATE_SALE: {
    eyebrow: "Die ehrliche Frage",
    title: "Brauchen Sie überhaupt einen Makler?",
    lead: "Manchmal nicht. Wer diese Frage stellt, verdient eine Antwort und keine Verkaufsbroschüre — deshalb stehen hier beide Seiten.",
    for_eyebrow: "Dafür spricht",
    for_title: "Wann der Verkauf in Eigenregie sinnvoll ist.",
    for_1: "Der Käufer steht schon fest. Verkauf innerhalb der Familie, an Nachbarn oder an den Mieter: der Markt muss nicht gefunden werden, es geht um Abwicklung. Dafür brauchen Sie einen Notar, keinen Makler.",
    for_2: "Die Immobilie verkauft sich von selbst. In sehr gefragten Lagen mit klarem Objekt und vollständigen Unterlagen ist die Nachfrage groß genug, dass auch ein unbeholfenes Inserat Interessenten bringt.",
    for_3: "Sie haben Zeit und Nerven. Besichtigungen an Abenden und Wochenenden, Rückfragen, Absagen, Verhandlungen — wer das gerne selbst macht und die Zeit hat, spart die Provision.",
    against_eyebrow: "Dagegen spricht",
    against_title: "Wo es in Eigenregie regelmäßig teuer wird.",
    against_1: "Der Preis wird am Anfang festgelegt, nicht am Ende. Ein zu hoher Einstiegspreis führt fast immer zu einer langen Vermarktung und danach zu einem Abschlag, der größer ist als die Provision. Ein zu niedriger fällt gar nicht auf.",
    against_2: "Die Unterlagen entscheiden über den Abschluss. Fehlender Energieausweis, unvollständige Teilungserklärung, offene Beschlüsse der Eigentümergemeinschaft: das fällt spätestens beim Notar auf und kostet dann Zeit oder Preis.",
    against_3: "Verhandeln über die eigene Immobilie ist schwer. Wer selbst darin gewohnt hat, hört Kritik am Objekt anders — und gibt in der Sache nach, wo man hätte stehen bleiben können, oder umgekehrt.",
    closing_eyebrow: "Unser Standpunkt",
    closing_title: "Fragen Sie uns, bevor Sie uns beauftragen.",
    closing_body: "Wenn wir nach dem ersten Gespräch den Eindruck haben, dass Sie die Immobilie gut selbst verkaufen können, sagen wir das. Das kostet uns einen Auftrag und erspart Ihnen eine Provision, die Ihnen nichts bringt. Umgekehrt sagen wir genauso deutlich, wenn wir glauben, dass ein Alleingang Sie mehr kostet als er spart.",
  },
};

export function isWebsitePageKey(value: string): value is WebsitePageKey {
  return Object.hasOwn(WEBSITE_PAGE_DEFINITIONS, value);
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
