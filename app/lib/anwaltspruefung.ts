// Was vor der produktiven Nutzung anwaltlich abzunehmen ist (15.10.2026).
//
// Diese Punkte standen bisher als Karte "Vor produktiver Nutzung -
// Anwaltlich abzunehmen" auf neun Arbeitsseiten. Sie gehoeren zur Freigabe
// des Systems, nicht in die taegliche Arbeit -- und verteilt auf neun
// Seiten liess sich nicht sehen, was insgesamt offen ist. Jetzt stehen sie
// gesammelt unter Verwaltung > Anwaltspruefung (routes/anwaltspruefung.tsx).
// Der Wortlaut ist unveraendert uebernommen.

export type AnwaltsPunkt = { bereich: string; ort: string; punkte: string[] };

export const ANWALTSPRUEFUNG: AnwaltsPunkt[] = [
  {
    "bereich": "Verfügungsberechtigung",
    "ort": "Objektakte › Eigentümer & Recht › Verfügungsberechtigung",
    "punkte": [
      "Welcher Erbnachweis im Einzelfall genügt und wann eine Grundbuchberichtigung vor dem Verkauf zwingend ist.",
      "Ob eine vorgelegte Vollmacht Form und Umfang für ein Grundstücksgeschäft erfüllt.",
      "In welchen Fällen eine betreuungs- oder familiengerichtliche Genehmigung erforderlich ist und wer sie beantragt.",
      "Ob und wann eine Ehegattenzustimmung erforderlich ist.",
      "Welche Nachlass- und Betreuungsunterlagen aufbewahrt werden dürfen und wie lange.",
      "Ob die Zustimmung aller Miterben vor Abschluss eines Maklerauftrags vorliegen muss."
    ]
  },
  {
    "bereich": "Recht & Lasten",
    "ort": "Objektakte › Eigentümer & Recht › Recht & Lasten",
    "punkte": [
      "Welche Angaben aus Grundbuch und Baulastenverzeichnis gegenüber Kaufinteressenten offenbart werden müssen und wann.",
      "Ob und wie ein Altlastenverdacht mitgeteilt werden muss und welche Haftung an einem Verschweigen hängt.",
      "Wie ein bestehendes Wohnrecht oder ein Nießbrauch im Exposé und im Kaufvertrag darzustellen ist.",
      "Ob die erfassten Einschätzungen zur Auswirkung auf den Verkauf gegenüber Dritten verwendet werden dürfen.",
      "Welche Aufbewahrungsfrist für Grundbuchauszüge und Behördenauskünfte gilt."
    ]
  },
  {
    "bereich": "Pflichtangaben & Energieausweis",
    "ort": "Objektakte › Objektdaten › Pflichtangaben",
    "punkte": [
      "Welche Angaben eine Immobilienanzeige im konkreten Fall tragen muss und ab wann eine Veröffentlichung als Anzeige gilt.",
      "Ob eine erfasste Ausnahme tatsächlich greift. Das System prüft nur, dass sie begründet und bestätigt ist.",
      "Ob für Gewerbeobjekte und für Objekte ohne Gebäude die hier gewählte Abgrenzung zutrifft.",
      "Wann der Energieausweis vorzulegen und wann er zu übergeben ist und was als Nachweis dafür genügt.",
      "Welche Folgen ein abgelaufener Ausweis für eine bereits laufende Vermarktung hat."
    ]
  },
  {
    "bereich": "WEG & Miete",
    "ort": "Objektakte › Objektdaten › WEG & Miete",
    "punkte": [
      "Ob und wann ein Vorkaufsrecht des Mieters besteht und wie es mitzuteilen ist.",
      "Wann eine Sperrfrist nach Umwandlung in Wohnungseigentum läuft und wie lange.",
      "Welche Angaben zu Mietverhältnis und Kaution dem Käufer offengelegt werden müssen.",
      "Wie mit Mietrückständen und laufenden Mieterhöhungen beim Eigentümerwechsel umzugehen ist.",
      "Ob die dargestellte Bruttomietrendite gegenüber Interessenten verwendet werden darf und welche Hinweise sie braucht."
    ]
  },
  {
    "bereich": "Geldwäsche am Objekt",
    "ort": "Objektakte › Abwicklung › Geldwäsche",
    "punkte": [
      "Ob und ab wann für dieses Maklerbüro geldwäscherechtliche Pflichten bestehen und welche Fälle erfasst werden müssen.",
      "Der Umfang der zu erhebenden Angaben, insbesondere zu wirtschaftlich Berechtigten und zur Herkunft der Mittel.",
      "Die zulässige Speicherung von Ausweisdaten und Ausweiskopien sowie die konkreten Löschfristen.",
      "Der interne Ablauf bei einem Treffer im Listenabgleich und bei einem Verdachtsfall einschließlich der Frage, wer meldet.",
      "Der Umgang mit dem Verbot, den Betroffenen über eine Meldung zu informieren."
    ]
  },
  {
    "bereich": "Geldwäsche & Aufbewahrung",
    "ort": "Verwaltung › Geldwäsche & Aufbewahrung",
    "punkte": [
      "Ob und ab wann für dieses Maklerbüro geldwäscherechtliche Pflichten bestehen und welche Fälle erfasst werden müssen.",
      "Die zulässige Speicherung von Ausweisdaten und Ausweiskopien sowie die konkreten Löschfristen.",
      "Der interne Ablauf bei einem Treffer im Listenabgleich und bei einem Verdachtsfall einschließlich der Frage, wer meldet.",
      "Der Umgang mit dem Verbot, den Betroffenen über eine Meldung zu informieren."
    ]
  },
  {
    "bereich": "Reservierung",
    "ort": "Abschluss › Reservierungen",
    "punkte": [
      "Ob und unter welchen Voraussetzungen ein Reservierungsentgelt überhaupt vereinbart werden darf.",
      "Welche Form eine Reservierungsvereinbarung braucht und was sie regeln darf.",
      "Welche Wirkung eine Reservierung gegenüber anderen Interessenten hat.",
      "Wie ein vereinnahmtes Entgelt bei Nichtzustandekommen des Kaufs zu behandeln ist."
    ]
  },
  {
    "bereich": "Abschluss & Übergabe",
    "ort": "Abschluss › Abschlüsse › Meilensteine",
    "punkte": [
      "Welche Meilensteine im eigenen Bundesland und bei welcher Objektart tatsächlich einschlägig sind.",
      "Wann ein Vorkaufsrecht des Mieters besteht, wie die Mitteilung zu erfolgen hat und wie die Frist läuft.",
      "Ob und wie das Übergabeprotokoll als Beweismittel taugt und welche Form die Bestätigung beider Seiten braucht.",
      "Wie mit bei der Übergabe festgestellten Mängeln umzugehen ist und wer sie wem mitteilt.",
      "Ob ein Reservierungsentgelt im jeweiligen Fall überhaupt vereinbart werden darf."
    ]
  },
  {
    "bereich": "Partner & Empfehlungsvergütung",
    "ort": "Adressen › Organisationen › Partner",
    "punkte": [
      "Ob und in welcher Form eine Empfehlungsvergütung an einen bestimmten Partner zulässig ist.",
      "Welche Berufsgruppen über die hier gelisteten hinaus als reguliert zu behandeln sind.",
      "Ob und wann eine Vergütung gegenüber dem Kunden offenzulegen ist.",
      "Wie eine bestehende Zusage zu behandeln ist, wenn sich der Compliance-Stand eines Partners nachträglich ändert."
    ]
  }
];
