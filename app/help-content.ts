// Die Anleitung zu ZeyherMutterOS.
//
// Diese Datei ist die einzige Quelle: die Anleitungsseite unter /crm/hilfe, der
// Hilfe-Link auf jeder internen Seite und die Word-Fassung zum Weitergeben
// lesen alle hier. Wer einen Text aendert, aendert ihn an genau einer Stelle.
//
// Jedes Kapitel nennt in `pfade`, fuer welche Seiten des CRM es zustaendig ist.
// Daraus bestimmt der Hilfe-Link, welches Kapitel er anspringt. Ein Doppelpunkt
// steht fuer ein beliebiges Wegstueck (`/properties/:id/legal`), ein Stern am
// Ende fuer "und alles darunter".

export type HelpBlock =
  | { art: "absatz"; text: string }
  | { art: "liste"; punkte: string[] }
  | { art: "schritte"; punkte: string[] }
  | { art: "hinweis"; text: string }
  | { art: "warnung"; text: string }
  // Breite und Hoehe gehoeren in die Daten: ohne sie faellt das Bild vor dem
  // Laden auf Hoehe null zusammen, und verzoegertes Laden springt nie an,
  // weil der Browser keine Ueberschneidung mit dem Sichtfeld erkennt.
  | { art: "bild"; datei: string; breite: number; hoehe: number; unterschrift: string };

export type HelpChapter = {
  id: string;
  nummer: string;
  titel: string;
  kurz: string;
  pfade: string[];
  bloecke: HelpBlock[];
};

export const HELP_TITLE = "Anleitung ZeyherMutterOS";
export const HELP_INTRO =
  "Diese Anleitung führt einmal durch den kompletten Verkaufsfall — vom ersten "
  + "Anruf eines Eigentümers bis zur Nachbetreuung nach der Übergabe. Sie ist in "
  + "der Reihenfolge geschrieben, in der die Arbeit tatsächlich anfällt. Wer "
  + "etwas Bestimmtes sucht, springt über das Inhaltsverzeichnis; wer neu "
  + "anfängt, liest von vorne.";

export const HELP_CHAPTERS: HelpChapter[] = [
  {
    id: "grundlagen",
    nummer: "1",
    titel: "Aufbau und Bedienung",
    kurz: "Anmelden, Navigation, Glocke, Suche — was auf jeder Seite gleich ist.",
    pfade: ["/crm", "/crm/search", "/crm/notifications"],
    bloecke: [
      { art: "absatz", text:
        "Angemeldet wird über die Adresse des Systems mit der eigenen E-Mail-Adresse "
        + "und dem persönlichen Passwort. Es gibt keine Sammelzugänge: jede Änderung "
        + "wird dem angemeldeten Benutzer zugeschrieben und ist später in der "
        + "Systemhistorie nachvollziehbar." },
      { art: "bild", datei: "uebersicht.jpg", breite: 1200, hoehe: 535, unterschrift:
        "Die Übersicht nach der Anmeldung. Links die Navigation, oben links die "
        + "Glocke mit der Anzahl ungelesener Benachrichtigungen." },
      { art: "absatz", text:
        "Die Navigation am linken Rand ist auf jeder Seite dieselbe und in fünf "
        + "Gruppen geteilt, die dem Ablauf eines Vorgangs folgen: Arbeitsplatz, "
        + "Akquise, Verkauf, Interessenten, Nach dem Verkauf und Verwaltung. Der "
        + "aktuelle Bereich ist hervorgehoben. Eine Ausnahme von der Reihenfolge "
        + "ist Absicht: **Immobilien** steht oben in der Gruppe Verkauf, obwohl "
        + "die Objektakte erst nach dem Maklerauftrag entsteht — es ist der "
        + "Eintrag, der am häufigsten gebraucht wird." },
      { art: "liste", punkte: [
        "Die Glocke oben links zeigt ungelesene Benachrichtigungen. Ein Klick öffnet die Liste, ein Klick auf einen Eintrag springt zum betroffenen Vorgang und markiert ihn als gelesen.",
        "„Suche\" findet Kontakte, Immobilien, Leads und Vorgänge über Namen und Nummern.",
        "Jede Nummer im System ist eindeutig und sprechend: ZM-K für Kontakte, ZM-2026- für Immobilien, ZM-L für Verkäufer-Leads, ZM-A für Anfragen, ZM-T für Aufgaben, ZM-VP für Verkaufsprojekte, ZM-KA für Kaufangebote, ZM-VK für Abschlüsse.",
        "Unten links steht die Umgebung. Steht dort BETA, ist es das Testsystem — dort darf gefahrlos geübt werden.",
      ]},
      { art: "hinweis", text:
        "Auf jeder Seite steht unten rechts ein Hilfe-Knopf. Er öffnet genau das "
        + "Kapitel dieser Anleitung, das die geöffnete Seite beschreibt — als "
        + "Fenster über der Seite, damit angefangene Eingaben nicht verloren gehen. "
        + "Aus dem Fenster heraus lässt sich die vollständige Anleitung zusätzlich "
        + "in einem eigenen Tab öffnen, etwa für einen zweiten Bildschirm." },
    ],
  },
  {
    id: "alltag",
    nummer: "2",
    titel: "Aufgaben, Kalender und E-Mail",
    kurz: "Wiedervorlagen, Termine und Nachrichten aus dem System heraus.",
    pfade: ["/crm/tasks", "/crm/calendar", "/crm/calendar/event.ics", "/crm/email"],
    bloecke: [
      { art: "absatz", text:
        "Aufgaben sind der Motor des Systems. Fast alles, was eine Frist hat, legt "
        + "automatisch eine Aufgabe an: eine ablaufende Widerrufsfrist, eine offene "
        + "gerichtliche Genehmigung, eine überfällige Anfrage, ein Nachbetreuungsschritt "
        + "nach der Übergabe. Diese Aufgaben tauchen nicht aus dem Nichts auf — sie "
        + "hängen immer an einem Vorgang und verlinken dorthin." },
      { art: "liste", punkte: [
        "„Aufgaben\" zeigt offene und laufende Aufgaben, sortiert nach Fälligkeit. Überfällige sind gekennzeichnet.",
        "Jede Aufgabe hat genau einen Verantwortlichen. Beobachter können zusätzlich eingetragen werden — sie bekommen Benachrichtigungen, sind aber nicht zuständig.",
        "Der Kalender zeigt Termine und Fälligkeiten. Einzelne Termine lassen sich als .ics-Datei in Outlook oder einen anderen Kalender übernehmen.",
        "Unter „E-Mail\" wird eine Nachricht mit Bezug zu einem Kontakt, Lead oder einer Anfrage vorbereitet. Das System verschickt nichts von selbst.",
      ]},
      { art: "warnung", text:
        "Das System versendet keine E-Mails automatisch. Auch die Nachbetreuung nach "
        + "der Übergabe erzeugt nur Wiedervorlagen — geschrieben wird von Hand." },
    ],
  },
  {
    id: "kontakte",
    nummer: "3",
    titel: "Kontakte und Organisationen",
    kurz: "Personen und Firmen anlegen, Rollen vergeben, Beziehungen abbilden.",
    pfade: ["/crm/contacts*", "/crm/organizations*"],
    bloecke: [
      { art: "absatz", text:
        "Jede Person im System ist ein Kontakt — Eigentümer, Interessent, Käufer, "
        + "Miterbe, Betreuer, Mieter, Notar, Handwerker. Ein Kontakt wird einmal "
        + "angelegt und danach über Rollen mit Vorgängen verknüpft. Dieselbe Person "
        + "kann gleichzeitig Verkäufer bei einem Objekt und Interessent bei einem "
        + "anderen sein." },
      { art: "schritte", punkte: [
        "„Organisationen\" → oder aus der Übersicht heraus „+ Anfrage\" für den schnellen Weg.",
        "Beim Anlegen genügen Vor- und Nachname. Alles weitere kann später ergänzt werden.",
        "Das System prüft beim Speichern auf mögliche Dubletten und weist darauf hin, statt stillschweigend eine zweite Karteileiche anzulegen.",
        "Über „Beziehungen\" werden Verbindungen zwischen Kontakten abgebildet — Ehepartner, Miterben, Bevollmächtigte.",
        "Über „Verknüpfungen\" ist zu sehen, an welchen Immobilien, Leads und Vorgängen der Kontakt hängt.",
      ]},
      { art: "absatz", text:
        "Organisationen sind Firmen und Partner: Notariate, Handwerksbetriebe, "
        + "Fotografen, Hausverwaltungen. Bei Partnern, die Empfehlungen aussprechen, "
        + "wird zusätzlich ein Partnerprofil geführt — mehr dazu im Kapitel über "
        + "Kampagnen und Partner." },
      { art: "hinweis", text:
        "Kontakte werden nicht gelöscht, sondern archiviert. Sie verschwinden dann "
        + "aus allen Auswahllisten, bleiben aber in abgeschlossenen Vorgängen "
        + "sichtbar. Das Archiv ist über die Verwaltung erreichbar." },
    ],
  },
  {
    id: "leads",
    nummer: "4",
    titel: "Verkäufer-Leads",
    kurz: "Der erste Kontakt mit einem Eigentümer, von der Anfrage bis zur Entscheidung.",
    pfade: ["/leads", "/leads/new", "/leads/:leadId"],
    bloecke: [
      { art: "absatz", text:
        "Ein Verkäufer-Lead ist ein Eigentümer, der über einen Verkauf nachdenkt. "
        + "Er entsteht entweder von Hand oder automatisch aus dem "
        + "Verkaufsstrategie-Check auf der Website. Der Lead ist die Vorstufe: hier "
        + "wird geklärt, ob überhaupt ein Verkauf ansteht." },
      { art: "liste", punkte: [
        "Die Pipeline führt von „Neu\" über „Kontaktiert\" und „Qualifiziert\" bis zu „Gewonnen\" oder „Kein weiteres Interesse\".",
        "„Kein weiteres Interesse\" verlangt einen Grund. Ohne Grund wird nicht gespeichert — das ist Absicht, weil die Gründe später ausgewertet werden.",
        "Jeder Lead hat eine Wiedervorlage. Ohne Wiedervorlage geht ein Lead in der Praxis verloren.",
        "Aus einem Lead entsteht per Knopfdruck eine Immobilie und ein Verkaufsprojekt. Die erfassten Geschäftsdaten werden dabei eingefroren, damit später nachvollziehbar bleibt, mit welchen Angaben gestartet wurde.",
      ]},
      { art: "hinweis", text:
        "Der Lead bleibt nach der Umwandlung bestehen und verweist auf die entstandene "
        + "Immobilie. Es entsteht keine Dublette." },
    ],
  },
  {
    id: "akquise",
    nummer: "5",
    titel: "Kampagnen, Gebiete und Partner",
    kurz: "Woraus ein Auftrag entstanden ist — messbar statt geschätzt.",
    pfade: ["/acquisition", "/acquisition/:campaignId", "/crm/organizations/:id/partner"],
    bloecke: [
      { art: "absatz", text:
        "Die Akquise wird in einer Kette geführt: Kanal → Kampagne → Gebiet → Welle → "
        + "Werbemittel → Reaktion → Termin → Vorgang. Damit lässt sich am Ende sagen, "
        + "welche Maßnahme in welchem Gebiet welche Aufträge gebracht hat." },
      { art: "schritte", punkte: [
        "Zuerst ein Gebiet anlegen — Gebiete lassen sich schachteln, etwa München → Trudering → Waldtrudering.",
        "Dann eine Kampagne im Gebiet: Zielgruppe, Anzahl angeschriebener Haushalte, Zeitraum, Kosten, Werbemittel, Thema.",
        "Innerhalb der Kampagne einzelne Wellen erfassen. Eine Welle darf nicht vor dem Kampagnenstart liegen.",
        "Beim Lead die Herkunft eintragen: Kampagne, Welle, empfehlender Partner, Reaktionsweg und -datum.",
      ]},
      { art: "absatz", text:
        "Bei Partnern wird ein Compliance-Kennzeichen geführt: Provision grundsätzlich "
        + "möglich, keine Provision, rechtliche Prüfung erforderlich, oder nur "
        + "Kooperation ohne Vergütung. Für regulierte Berufsgruppen — Rechtsanwälte, "
        + "Notare — verweigert das System die Erfassung einer Vergütung und nennt den "
        + "Grund im Klartext." },
      { art: "warnung", text:
        "Ob eine Empfehlungsvergütung im Einzelfall zulässig ist, entscheidet das "
        + "System nicht. Es setzt nur um, was als Kennzeichen hinterlegt wurde." },
    ],
  },
  {
    id: "projekt",
    nummer: "6",
    titel: "Das Verkaufsprojekt",
    kurz: "Die Klammer um alles: Eigentümer, Objekt, Check, Auftrag, Vermarktung, Abschluss.",
    pfade: ["/projects", "/projects/:projectId"],
    bloecke: [
      { art: "absatz", text:
        "Das Verkaufsprojekt hält einen Verkaufsfall zusammen. Wer wissen will, wie "
        + "es um einen Fall steht, öffnet das Projekt und nicht sechs Einzellisten." },
      { art: "bild", datei: "verkaufsprojekt.jpg", breite: 1200, hoehe: 535, unterschrift:
        "Ein Verkaufsprojekt: oben die eine nächste Aktion, darunter die offenen "
        + "Punkte bis zum Vermarktungsstart." },
      { art: "absatz", text:
        "Zwei Karten tragen das Projekt. **Nächste Aktion** nennt genau eine Sache "
        + "mit Fälligkeit und Verantwortlichem — nicht drei, sondern eine. **Offene "
        + "Punkte** führt zusammen, was dem Vermarktungsstart noch im Weg steht: "
        + "Maßnahmen, Vermarktungsreife, Pflichtangaben, Verfügungsberechtigung und "
        + "Maklerauftrag. Jeder Punkt verlinkt an die Stelle, wo er zu erledigen ist." },
      { art: "warnung", text:
        "Ein Projekt lässt sich auch dann in die Vermarktung setzen, wenn offene "
        + "Punkte bestehen. Das System warnt, es entscheidet nicht. Die Verantwortung "
        + "bleibt beim Makler." },
    ],
  },
  {
    id: "check",
    nummer: "7",
    titel: "Verkaufsstrategie-Check",
    kurz: "Szenarien vergleichen, Maßnahmen planen, die Entscheidung des Eigentümers festhalten.",
    pfade: ["/crm/sales-readiness", "/leads/:leadId/sales-readiness"],
    bloecke: [
      { art: "absatz", text:
        "Der Check beantwortet die Frage, die im Erstgespräch wirklich zählt: Was "
        + "sollte vor dem Verkauf noch gemacht werden, was lohnt sich nicht mehr, und "
        + "was kostet das an Zeit und Geld?" },
      { art: "bild", datei: "verkaufsstrategie-check.jpg", breite: 1200, hoehe: 535, unterschrift:
        "Ein Check im Entwurf. Oben steht, was zur Prüfbereitschaft noch fehlt." },
      { art: "schritte", punkte: [
        "Ausgangssituation, Verkaufsziel und Besichtigungsdatum erfassen.",
        "Szenarien anlegen — typischerweise „ohne Aufbereitung\", „kleine Maßnahmen\", „umfassende Aufbereitung\". Je Szenario Preisspanne, Investition und Dauer.",
        "Genau ein Szenario empfehlen. Auch „nicht empfohlen\" ist eine zulässige Empfehlungsstufe und oft die ehrlichste.",
        "Maßnahmen erfassen und dem Szenario zuordnen.",
        "Den Check zur Prüfung markieren und anschließend finalisieren. Danach ist er unveränderlich; eine fachliche Änderung erzeugt eine neue Revision.",
        "Die Entscheidung des Eigentümers dokumentieren.",
      ]},
      { art: "warnung", text:
        "Alle Zahlen im Check sind ausdrücklich Einschätzungen und keine Zusicherung. "
        + "Das steht auch so in der Oberfläche und gehört im Gespräch mit dem "
        + "Eigentümer genauso gesagt." },
      { art: "hinweis", text:
        "Für die Textbausteine erzeugt das System einen Prompt zum Kopieren. Es ist "
        + "keine KI angebunden — der Text wird außerhalb erzeugt und bewusst wieder "
        + "eingefügt." },
    ],
  },
  {
    id: "immobilie",
    nummer: "8",
    titel: "Die Objektakte",
    kurz: "Die Immobilie anlegen und durch ihre Statusstufen führen.",
    pfade: ["/properties", "/properties/new", "/properties/:propertyId"],
    bloecke: [
      { art: "absatz", text:
        "Die Objektakte ist die zentrale Seite einer Immobilie. Über ihr steht eine "
        + "Leiste mit allen Abschnitten der Akte — Recht & Lasten, "
        + "Verfügungsberechtigung, Preis & Wert, WEG & Miete, Pflichtangaben, "
        + "Interessenten, Website, Exposés, Vermarktung, Dokumente, Medien, "
        + "Geldwäsche." },
      { art: "bild", datei: "objektakte.jpg", breite: 1200, hoehe: 535, unterschrift:
        "Die Objektakte. Oben die Abschnittsleiste, darunter Statuswechsel und die "
        + "Karten mit dem jeweiligen Stand." },
      { art: "absatz", text:
        "Der Objektstatus läuft: Entwurf → Akquise → Bewertung → Auftrag ausstehend → "
        + "Vorbereitung → Vermarktung → Reserviert → Notar → Verkauft. Daneben gibt es "
        + "Verloren, Zurückgezogen und Archiviert." },
      { art: "warnung", text:
        "Der Schritt von Vorbereitung nach Vermarktung ist gesperrt, solange die "
        + "Vermarktungsreife nicht erreicht ist. Die Checkliste auf der Objektakte "
        + "zeigt, was fehlt. Diese Sperre sitzt in der Datenbank und lässt sich nicht "
        + "über das Formular umgehen." },
    ],
  },
  {
    id: "recht",
    nummer: "9",
    titel: "Recht & Lasten, Verfügungsberechtigung",
    kurz: "Grundbuch, Belastungen — und die Frage, wer überhaupt verkaufen darf.",
    pfade: ["/properties/:propertyId/legal", "/properties/:propertyId/disposition"],
    bloecke: [
      { art: "absatz", text:
        "Unter **Recht & Lasten** wird die Immobilie als Rechtsobjekt erfasst: "
        + "Grundbuchdaten mit Amtsgericht, Blatt, Gemarkung, Flur und Flurstück; "
        + "Abteilung II mit Wohnrechten, Nießbrauch, Wegerechten und Vorkaufsrechten; "
        + "Abteilung III mit Gläubiger, Nennbetrag, Restvaluta und Rang; dazu "
        + "Erbbaurecht, Baulasten, Denkmalschutz und Altlastenverdacht." },
      { art: "absatz", text:
        "Unter **Verfügungsberechtigung** wird geklärt, wer verkaufen darf. Das ist "
        + "bei Nachlass- und Seniorenimmobilien der halbe Job. Abgebildet werden "
        + "Erbfall und Erbnachweis, Erbengemeinschaft mit Quoten und Zustimmung je "
        + "Miterbe, Testamentsvollstreckung, Vollmachten mit Art und Form, Betreuung "
        + "mit Aufgabenkreis und gerichtlicher Genehmigung, minderjährige Beteiligte "
        + "und die Ehegattenzustimmung." },
      { art: "absatz", text:
        "Das System nennt jederzeit den Stand: „Verfügungsberechtigung geklärt\" oder "
        + "eine Liste dessen, was offen ist. Fehlende Genehmigungen und ausstehende "
        + "Zustimmungen erzeugen Wiedervorlagen." },
      { art: "warnung", text:
        "Ob eine Vollmacht in Form und Umfang ausreicht, ob ein Erbnachweis genügt "
        + "und wann eine gerichtliche Genehmigung nötig ist, beurteilt das System "
        + "nicht. Es erfasst, zeigt und erinnert. Diese Fragen gehören zum Anwalt." },
      { art: "hinweis", text:
        "Keine dieser Angaben gelangt automatisch in die öffentliche Anzeige." },
    ],
  },
  {
    id: "preis",
    nummer: "10",
    titel: "Preis & Wert",
    kurz: "Preisverlauf mit Begründung und die Wertermittlung mit Verfahren.",
    pfade: ["/properties/:propertyId/pricing"],
    bloecke: [
      { art: "absatz", text:
        "Jede Preisänderung wird als eigene Stufe erfasst — mit Datum, altem und "
        + "neuem Wert, Begründung und Verantwortlichem. Das System zählt je Stufe "
        + "automatisch mit: Tage im Markt, Anfragen, Besichtigungen, Kaufangebote. "
        + "Damit lässt sich im Rückblick belegen, warum ein Preis wann geändert wurde." },
      { art: "absatz", text:
        "Die Wertermittlung hält das Verfahren fest — Vergleichswert, Ertragswert, "
        + "Sachwert oder Marktpreiseinschätzung —, dazu Bewertungsdatum, Bewerter, "
        + "Bodenrichtwert mit Stichtag und Quelle, herangezogene Vergleichsobjekte und "
        + "die Ergebnisspanne." },
      { art: "absatz", text:
        "Das Besichtigungsfeedback wird je Objekt verdichtet: „von zwölf "
        + "Besichtigungen halten neun den Preis für zu hoch\" ist ein Satz, mit dem "
        + "sich ein Preisgespräch führen lässt." },
      { art: "warnung", text:
        "Das System gibt keine Preisempfehlung ab und rechnet Zu- und Abschläge nicht "
        + "in das Ergebnis ein. Die Gewichtung ist eine fachliche Entscheidung und "
        + "bleibt beim Bewerter." },
    ],
  },
  {
    id: "weg",
    nummer: "11",
    titel: "WEG & Miete",
    kurz: "Eigentumswohnungen und vermietete Objekte vollständig abbilden.",
    pfade: ["/properties/:propertyId/hoa-tenancy"],
    bloecke: [
      { art: "absatz", text:
        "Für Eigentumswohnungen: Miteigentumsanteil, Hausgeld getrennt nach Umlage und "
        + "Rücklagenanteil, Höhe der Erhaltungsrücklage, beschlossene und absehbare "
        + "Sonderumlagen mit Betrag und Zweck, Sondernutzungsrechte, Verwalter mit "
        + "Vertragslaufzeit, Beschlusssammlung, Wirtschaftsplan, Jahresabrechnung und "
        + "anstehende Sanierungen." },
      { art: "absatz", text:
        "Für vermietete Objekte: Mietvertragsdatum und -art, Ist-Kaltmiete, "
        + "Nebenkostenvorauszahlung, Kaution, Staffel- oder Indexmiete, "
        + "Kündigungsverzicht, laufende Mieterhöhung, Mietrückstände, Untervermietung, "
        + "der Mieter als Kontakt, Mietervorkaufsrecht und Sperrfrist nach Umwandlung." },
      { art: "hinweis", text:
        "Die Bruttomietrendite erscheint nur, wenn die Grunddaten vollständig sind. "
        + "Sonst steht dort „nicht berechenbar\" — eine Rendite auf halber Datenlage "
        + "wäre eine erfundene Zahl." },
    ],
  },
  {
    id: "pflichtangaben",
    nummer: "12",
    titel: "Pflichtangaben vor der Veröffentlichung",
    kurz: "Energieausweis und die harte Prüfung vor dem Marktstart.",
    pfade: ["/properties/:propertyId/mandatory-data"],
    bloecke: [
      { art: "absatz", text:
        "Vor dem Wechsel in die Vermarktung und vor jeder Veröffentlichung prüft das "
        + "System die Angaben, die eine Immobilienanzeige tragen muss." },
      { art: "bild", datei: "pflichtangaben.jpg", breite: 1200, hoehe: 535, unterschrift:
        "Die Pflichtangaben. Der grüne Balken bestätigt Vollständigkeit — nicht "
        + "rechtliche Richtigkeit." },
      { art: "liste", punkte: [
        "Art des Ausweises: Bedarf oder Verbrauch.",
        "Endenergiewert in kWh/(m²·a).",
        "Wesentlicher Energieträger, so wie er im Ausweis steht.",
        "Baujahr laut Ausweis und Energieeffizienzklasse.",
        "Gültigkeit — ein abgelaufener Ausweis blockiert eine neue Veröffentlichung.",
      ]},
      { art: "absatz", text:
        "Fehlt etwas, wird die Veröffentlichung mit klarer Begründung blockiert. "
        + "Ausnahmefälle — etwa Denkmalschutz — lassen sich als ausdrücklich begründete "
        + "Ausnahme erfassen, nicht als stilles Übergehen." },
      { art: "absatz", text:
        "Zusätzlich wird dokumentiert, dass der Energieausweis dem Interessenten "
        + "spätestens bei der Besichtigung vorgelegt und bei Vertragsschluss übergeben "
        + "wurde." },
      { art: "warnung", text:
        "Die Prüfung stellt Vollständigkeit fest, nicht Richtigkeit. Ob eine erfasste "
        + "Ausnahme tatsächlich greift, entscheidet das System nicht." },
    ],
  },
  {
    id: "auftrag",
    nummer: "13",
    titel: "Maklerauftrag, Provision und Widerruf",
    kurz: "Der Vorgang, aus dem der Provisionsanspruch nachvollziehbar hervorgeht.",
    pfade: ["/mandates", "/mandates/new", "/mandates/:mandateId"],
    bloecke: [
      { art: "absatz", text:
        "Der Maklerauftrag ist ein eigener Vorgang, kein bloßes Dokument. Erfasst "
        + "werden Auftraggeber, Objekt, Auftragsart — einfacher Auftrag, Alleinauftrag "
        + "oder qualifizierter Alleinauftrag —, Vertragsschluss mit Datum und Form, "
        + "Laufzeit, Verlängerungsregel, Kündigung und tatsächliches Ende." },
      { art: "absatz", text:
        "Die Provisionsvereinbarung wird getrennt je Seite geführt: Prozentsatz oder "
        + "Festbetrag, Bezugsgröße und Fälligkeitsereignis." },
      { art: "liste", punkte: [
        "Bei Doppeltätigkeit müssen beide Provisionsseiten gleich hoch sein. Eine Abweichung wird abgewiesen.",
        "Eine Käuferprovision, die bei einseitigem Auftrag höher ist als die Verkäuferprovision, wird abgewiesen.",
        "Die Fälligkeit der Käuferprovision wird erst freigegeben, wenn der Zahlungsnachweis der Auftraggeberseite hinterlegt ist.",
      ]},
      { art: "absatz", text:
        "Beim Widerruf werden Belehrung mit Datum, Form und Beleg erfasst, dazu "
        + "Fristende, das ausdrückliche Verlangen nach vorzeitigem Leistungsbeginn, "
        + "die Kenntnisnahme des Wertersatzes und ein etwaiger erklärter Widerruf. Die "
        + "Widerrufsfrist erzeugt eine Wiedervorlage." },
      { art: "warnung", text:
        "Fehlt bei einem Verbraucherauftrag die dokumentierte Belehrung, warnt das "
        + "System am Auftrag und am Objekt. Ein Vermarktungsstart innerhalb der "
        + "laufenden Frist ohne dokumentiertes Verlangen wird als Risiko "
        + "gekennzeichnet — aber nicht verhindert." },
    ],
  },
  {
    id: "geldwaesche",
    nummer: "14",
    titel: "Geldwäsche und Aufbewahrung",
    kurz: "Identifizierung beider Seiten, Risikoeinstufung, Fristen.",
    pfade: ["/compliance", "/properties/:propertyId/compliance"],
    bloecke: [
      { art: "absatz", text:
        "Je Verkaufsimmobilie wird eine Geldwäscheakte geführt. Erfasst werden die "
        + "Identifizierung von Verkäufer- und Käuferseite mit Ausweisart, Nummer, "
        + "ausstellender Behörde, Gültigkeit, Datum, identifizierender Person und "
        + "Verfahren; der wirtschaftlich Berechtigte bei juristischen Personen; die "
        + "Risikoeinstufung mit Begründung und Prüfdatum; der dokumentierte Abgleich "
        + "mit PEP- und Sanktionslisten; die Herkunft der Mittel; der Nachweis der "
        + "unbaren Zahlung." },
      { art: "bild", datei: "geldwaesche-aufbewahrung.jpg", breite: 1200, hoehe: 535, unterschrift:
        "Die Übersicht über alle Geldwäscheakten und die ablaufenden "
        + "Aufbewahrungsfristen." },
      { art: "warnung", text:
        "Diese Daten sind besonders geschützt. Sie sind nur für Rollen mit "
        + "ausdrücklicher Berechtigung sichtbar, und jeder Zugriff wird protokolliert. "
        + "Ausweisdaten gehören nicht in freie Notizfelder." },
      { art: "absatz", text:
        "Vor der Beurkundung warnt die Abschlussakte, wenn die Identifizierung beider "
        + "Seiten nicht dokumentiert ist. Der Hinweis blockiert den Vorgang nicht und "
        + "stellt nicht fest, ob eine Pflicht besteht." },
      { art: "absatz", text:
        "Unter „Löschreife und Lücken\" auf derselben Seite steht, welche Unterlagen "
        + "löschreif sind, welche kein Löschdatum haben und für welche Dokumentarten "
        + "überhaupt keine Aufbewahrungsregel hinterlegt ist. Einen Löschknopf gibt es "
        + "bewusst nicht: wie lange aufzubewahren ist, ist eine rechtliche Frage." },
    ],
  },
  {
    id: "unterlagen",
    nummer: "15",
    titel: "Dokumente, Unterlagenliste und Medien",
    kurz: "Unterlagen anfordern, ablegen, versionieren und Bilder verwalten.",
    pfade: [
      "/properties/:propertyId/documents",
      "/properties/:propertyId/document-requirements",
      "/properties/:propertyId/media",
    ],
    bloecke: [
      { art: "absatz", text:
        "Dokumente hängen an einer Immobilie oder einem Kontakt und tragen eine "
        + "Kategorie — Grundbuchauszug, Flurkarte, Grundriss, Energieausweis, "
        + "Teilungserklärung, Maklerauftrag, Übergabeprotokoll und weitere. Aus der "
        + "Kategorie leitet das System beim Anlegen die Aufbewahrungsfrist ab, sofern "
        + "für sie eine Regel hinterlegt ist." },
      { art: "liste", punkte: [
        "Jedes Dokument wird versioniert. Die aktuelle Version ist geschützt und lässt sich nicht überschreiben.",
        "Dateien liegen in einem privaten Speicher und sind nur über das System erreichbar.",
        "Medien — Fotos, Grundrisse — werden getrennt von Dokumenten geführt, weil sie in Exposé und Website einfließen.",
        "Ein Bild wird erst öffentlich, wenn eine Veröffentlichungsversion freigegeben wurde.",
      ]},
      { art: "hinweis", text:
        "Ein Weiterbildungsnachweis lässt sich derzeit noch nicht hochladen: die "
        + "Dokumentenablage kennt nur Immobilie und Kontakt als Anker, nicht den "
        + "Benutzer. Der Nachweis wird deshalb ohne Datei geführt." },

      { art: "absatz", text:
        "**Die Unterlagenliste** beantwortet die andere Frage: nicht was da ist, "
        + "sondern was noch fehlt. Sie steht in der Objektakte unter "
        + "**Unterlagenliste** und führt je Objekt eine Zeile pro Unterlage mit "
        + "ihrem Stand — Fehlt, Angefordert, Vorhanden, Zu prüfen, Geprüft, "
        + "Veraltet oder Nicht erforderlich." },
      { art: "schritte", punkte: [
        "Arbeitsliste übernehmen. Damit stehen die üblichen Unterlagen als Zeilen in der Akte. Vorhandene Zeilen bleiben unverändert.",
        "Zeilen, die dieses Objekt nicht betrifft, auf „Nicht erforderlich“ setzen — etwa die Teilungserklärung bei einem freistehenden Haus.",
        "Beim Anfordern das Datum und den Kontakt eintragen, bei dem angefordert wurde. Für eine Frist lässt sich aus derselben Zeile eine Wiedervorlage anlegen.",
        "Nach dem Eingang das Eingangsdatum setzen und das Dokument aus der Ablage verknüpfen.",
        "Wer die Unterlage prüft, setzt den Stand auf „Geprüft“; das System trägt die prüfende Person selbst ein.",
      ]},
      { art: "liste", punkte: [
        "**Gültig bis** ist für Unterlagen gedacht, die altern — der Energieausweis etwa. Läuft das Datum ab, weist die Seite darauf hin.",
        "Die Liste prüft nur, ob die erfassten Angaben zueinander passen: kein Datum in der Zukunft, keine Prüfung vor dem Eingang, kein Dokument aus einer fremden Akte.",
        "Die Arbeitsliste selbst ist frei änderbar — Zeilen lassen sich abschalten, umbenennen oder ergänzen.",
      ]},
      { art: "warnung", text:
        "Die Unterlagenliste sagt **nicht**, welche Unterlage vorgeschrieben ist. "
        + "Sie ist die Arbeitsliste dieses Büros: „Fehlt“ heißt „steht auf unserer "
        + "Liste und ist noch nicht da“. Was im Einzelfall gebraucht wird, "
        + "entscheiden die Beteiligten — im Zweifel mit rechtlichem Rat, nicht mit "
        + "dieser Software." },
    ],
  },
  {
    id: "vermarktung",
    nummer: "16",
    titel: "Website, Exposés und Portale",
    kurz: "Vom internen Objekt zur öffentlichen Anzeige — über freigegebene Versionen.",
    pfade: [
      "/properties/:propertyId/publication",
      "/properties/:propertyId/publication/preview",
      "/properties/:propertyId/exposes*",
      "/properties/:propertyId/marketing",
      "/crm/website*",
    ],
    bloecke: [
      { art: "absatz", text:
        "Die Website liest niemals direkt aus der Objektakte. Sie liest eine "
        + "freigegebene, unveränderliche Version. Eine interne Korrektur ändert die "
        + "laufende Anzeige also nicht von selbst — das ist anzeigenrechtlich wichtig "
        + "und in der Praxis beruhigend." },
      { art: "bild", datei: "veroeffentlichung.jpg", breite: 1200, hoehe: 280, unterschrift:
        "Das Publikationsprinzip: intern bearbeiten, Snapshot veröffentlichen." },
      { art: "schritte", punkte: [
        "Öffentlichen Titel, URL-Kürzel, Untertitel, Kurztext und Objektbeschreibung erfassen.",
        "Die Vorschau prüfen — sie ist intern und veröffentlicht nichts.",
        "Freigeben. Erst damit entsteht die öffentliche Version.",
        "Wird intern etwas geändert, weist das System auf unveröffentlichte Änderungen hin und verlangt eine neue Freigabe.",
      ]},
      { art: "absatz", text:
        "Exposés werden aus einer konkreten Publikationsversion erzeugt und ebenfalls "
        + "versioniert. Unter „Vermarktung & Portale\" wird je Kanal festgehalten, wo "
        + "das Objekt läuft. Es gibt keine vorgetäuschte Portalanbindung — geschaltet "
        + "wird beim Portal, dokumentiert wird hier." },
    ],
  },
  {
    id: "interessenten",
    nummer: "17",
    titel: "Suchprofile, Anfragen und Besichtigungen",
    kurz: "Die Käuferseite: Bedarf erfassen, schnell antworten, Termine dokumentieren.",
    pfade: [
      "/search-profiles*", "/inquiries*", "/viewings*",
      "/properties/:propertyId/interests",
    ],
    bloecke: [
      { art: "absatz", text:
        "Ein Suchprofil hält fest, was ein Interessent sucht: Preisspanne, Fläche, "
        + "Zimmer, Baujahr, Lage mit Suchradius, Kauf oder Miete, Finanzierungsstand "
        + "und gewünschte Merkmale. Daraus schlägt das System passende Objekte vor — "
        + "mit nachvollziehbaren Gründen, nicht als Punktzahl aus einer Blackbox." },
      { art: "bild", datei: "anfragen-reaktionszeit.jpg", breite: 1200, hoehe: 535, unterschrift:
        "Die Reaktionszeit je Eingangskanal. Überfällige Anfragen lassen sich per "
        + "Knopfdruck eskalieren." },
      { art: "absatz", text:
        "Anfragen kommen über Website, Portal, Telefon oder persönlich herein. Je "
        + "Kanal ist eine Zielzeit hinterlegt — für einen Rückruf kürzer als für eine "
        + "Portalanfrage. Überschreitungen sind sichtbar, und „Überfällige eskalieren\" "
        + "legt je überfälliger Anfrage genau eine Wiedervorlage an, einmalig und nur "
        + "auf Knopfdruck." },
      { art: "absatz", text:
        "Besichtigungen werden mit Termin, Treffpunkt und Teilnehmern geplant. Danach "
        + "wird das Feedback erfasst: Interessenniveau, Positives, Bedenken, "
        + "Preisrückmeldung und nächster Schritt. Dieses Feedback fließt in die "
        + "Preisauswertung ein." },
      { art: "hinweis", text:
        "Unter „Interessenten & Besichtigungen\" in der Objektakte steht dasselbe aus "
        + "Sicht der Immobilie: wem sie nachgewiesen wurde und wer sie gesehen hat." },
    ],
  },
  {
    id: "angebote",
    nummer: "18",
    titel: "Kaufangebote und Reservierung",
    kurz: "Vom Angebot bis zur reservierten Immobilie.",
    pfade: ["/purchase-offers*", "/reservations"],
    bloecke: [
      { art: "absatz", text:
        "Ein Kaufangebot trägt Betrag, Gültigkeit, Abgabedatum und Notizen. Je "
        + "Interessent und Objekt ist immer nur ein Angebot aktiv; ein Folgeangebot "
        + "ersetzt das vorige ausdrücklich, statt es zu überschreiben. Damit bleibt "
        + "die Verhandlung nachvollziehbar." },
      { art: "absatz", text:
        "Beim Anlegen zeigt das System den zugehörigen Objektnachweis an — oder "
        + "markiert deutlich, dass keiner vorliegt." },
      { art: "absatz", text:
        "Eine Reservierung hält Interessent, Objekt, Zeitraum, reservierten Preis, "
        + "Bedingungen und Ablaufdatum fest und erzeugt eine Wiedervorlage zum Ablauf. "
        + "Eine Aufhebung verlangt einen Grund." },
      { art: "warnung", text:
        "Reservierungsentgelte sind rechtlich heikel. Das System erfasst sie nur, "
        + "schlägt sie nicht vor und berechnet nichts. Ein Entgelt lässt sich nur "
        + "speichern, wenn die Vereinbarung als dokumentiert gekennzeichnet ist — "
        + "sonst wird der Speichervorgang mit Begründung abgewiesen." },
    ],
  },
  {
    id: "abschluss",
    nummer: "19",
    titel: "Abschluss, Notar und Übergabe",
    kurz: "Von der Beurkundung bis zur Eigentumsumschreibung, mit Übergabeprotokoll.",
    pfade: ["/closings", "/closings/:closingId", "/closings/:closingId/milestones"],
    bloecke: [
      { art: "absatz", text:
        "Die Abschlussakte hält den Weg zwischen Beurkundung und "
        + "Eigentumsumschreibung zusammen, damit dafür keine Nebenliste nötig ist." },
      { art: "bild", datei: "abschluss.jpg", breite: 1200, hoehe: 535, unterschrift:
        "Eine Abschlussakte mit den beiden Warnungen zu Verfügungsberechtigung und "
        + "Geldwäsche, die vor der Beurkundung offen sind." },
      { art: "absatz", text:
        "Die Meilensteine werden je mit Datum, Zuständigem und Wiedervorlage geführt: "
        + "Auflassungsvormerkung, Lastenfreistellung und Löschungsbewilligungen, "
        + "Vorkaufsrecht der Gemeinde, Vorkaufsrecht des Mieters, Verwalterzustimmung "
        + "bei WEG, Fälligkeitsmitteilung des Notars, Grunderwerbsteuerbescheid und "
        + "Unbedenklichkeitsbescheinigung, Eigentumsumschreibung." },
      { art: "absatz", text:
        "Das Übergabeprotokoll erfasst Termin, Anwesende, Zählerstände je Zähler mit "
        + "Art, Nummer und Ablesedatum, Schlüssel je Art mit Anzahl, Zustand der "
        + "Räume, verbleibendes Inventar, Mängel und die Übergabe des Energieausweises "
        + "— als auswertbarer Datensatz, nicht nur als abgelegtes Blatt Papier." },
      { art: "hinweis", text:
        "Erst mit der Eigentumsumschreibung gilt der Fall als vollständig "
        + "abgeschlossen. Der Objektstatus „Verkauft\" bleibt davon unberührt." },
    ],
  },
  {
    id: "provisionen",
    nummer: "20",
    titel: "Provisionen",
    kurz: "Innen- und Außenprovision, Rechnung und Zahlung getrennt geführt.",
    pfade: ["/commissions", "/commissions/new", "/commissions/:commissionId"],
    bloecke: [
      { art: "absatz", text:
        "Eine Provision erbt die Konditionen aus dem Maklerauftrag, bleibt aber "
        + "einzeln übersteuerbar. Sie wird getrennt nach Innen- und Außenseite "
        + "geführt, wahlweise als Prozentsatz oder Festbetrag." },
      { art: "absatz", text:
        "Rechnungsstatus und Zahlungsstatus sind zwei verschiedene Dinge und werden "
        + "getrennt geführt. Jeder Statuswechsel wird protokolliert." },
    ],
  },
  {
    id: "nachbetreuung",
    nummer: "21",
    titel: "Nachbetreuung, Empfehlungen und Case Studies",
    kurz: "Den abgeschlossenen Fall geschäftlich weiterverwenden.",
    pfade: ["/after-sales", "/referrals*", "/case-studies*"],
    bloecke: [
      { art: "absatz", text:
        "Nach der dokumentierten Übergabe entstehen automatisch Wiedervorlagen aus "
        + "festen Bausteinen: Nachfassen nach der Übergabe, Empfehlungsanfrage, "
        + "Jahrestag. Die Bausteine — Titel, Adressat, Abstand in Tagen, Priorität — "
        + "lassen sich unter „Nachbetreuung\" anpassen." },
      { art: "absatz", text:
        "Unter „Empfehlungen\" wird festgehalten, wer wen empfohlen hat und was daraus "
        + "geworden ist. Das koppelt auf das Partnerprofil zurück." },
      { art: "absatz", text:
        "Eine Case Study wird aus den vorhandenen Daten aufgebaut: Ausgangszustand, "
        + "ursprüngliche Preiseinschätzung, durchgeführte Maßnahmen, Investitionssumme, "
        + "Dauer der Aufbereitung, Vermarktungsdauer, Verkaufspreis, "
        + "Vorher-/Nachher-Medien und Lessons Learned." },
      { art: "warnung", text:
        "Die Marketingfreigabe des Eigentümers wird getrennt dokumentiert. Ohne sie "
        + "wird nichts verwendet. Die anonymisierte Fassung prüft das System auf "
        + "Erfassung, nicht auf Wirkung — ob eine Person trotzdem erkennbar bleibt, "
        + "muss ein Mensch beurteilen." },
    ],
  },
  {
    id: "auswertung",
    nummer: "22",
    titel: "Dashboard und Auswertung",
    kurz: "Kennzahlen über den eigenen Arbeitsplatz oder das ganze Unternehmen.",
    pfade: ["/reports"],
    bloecke: [
      { art: "bild", datei: "auswertung.jpg", breite: 1200, hoehe: 535, unterschrift:
        "Die Auswertung, umschaltbar zwischen eigenem Arbeitsplatz und Unternehmen." },
      { art: "absatz", text:
        "Die Auswertung lässt sich zwischen „Mein Arbeitsplatz\" und „Unternehmen\" "
        + "umschalten und über Schnellzeiträume oder einen freien Zeitraum "
        + "eingrenzen. Dazu kommen die Auswertungen zu Kampagnen nach Gebiet und zu "
        + "Partnerempfehlungen." },
      { art: "hinweis", text:
        "Es werden ausschließlich tatsächlich vorhandene Geschäftsdaten gezeigt. Es "
        + "gibt keine Hochrechnung und keine Beispielzahlen. Wo eine Kennzahl nicht "
        + "berechenbar ist, steht das auch so da." },
    ],
  },
  {
    id: "verwaltung",
    nummer: "23",
    titel: "Verwaltung: Benutzer, Weiterbildung, Historie, Archiv",
    kurz: "Rechte vergeben, Nachweise führen, Änderungen nachvollziehen.",
    pfade: ["/crm/users", "/crm/training", "/crm/history", "/crm/archive"],
    bloecke: [
      { art: "absatz", text:
        "Unter **Benutzer & Rollen** werden Zugänge freigeschaltet und Rollen "
        + "vergeben. Niemand kann sich selbst höhere Rechte geben; die Administratorrolle "
        + "vergibt nur ein Administrator. Jede Änderung landet in der Systemhistorie." },
      { art: "bild", datei: "weiterbildung.jpg", breite: 1200, hoehe: 535, unterschrift:
        "Die Weiterbildung mit dem Stand je Benutzer im laufenden Zeitraum." },
      { art: "absatz", text:
        "Unter **Weiterbildung** wird je Benutzer erfasst, welche Maßnahme wann mit "
        + "wie vielen Stunden belegt wurde. Das System summiert die Stunden im "
        + "laufenden Zeitraum und zeigt, wie viel noch offen ist. Stunden dürfen mit "
        + "Komma eingegeben werden." },
      { art: "bild", datei: "systemhistorie.jpg", breite: 1200, hoehe: 535, unterschrift:
        "Die Systemhistorie mit Filter nach Bereich, Aktion, Benutzer und Referenz." },
      { art: "absatz", text:
        "Die **Systemhistorie** protokolliert jede Änderung mit Zeitpunkt, Benutzer, "
        + "Bereich, Vorgangsnummer und den geänderten Feldern — alter Wert, neuer "
        + "Wert. Sie ist append-only: Einträge lassen sich nicht ändern und nicht "
        + "löschen. Gefiltert wird nach Bereich, Aktion, Benutzer und Referenz." },
      { art: "absatz", text:
        "Im **Archiv** stehen archivierte Datensätze aller Bereiche. Archivieren ist "
        + "kein Löschen: der Vorgang verschwindet aus den Arbeitslisten und bleibt "
        + "nachvollziehbar." },
      { art: "warnung", text:
        "Die hinterlegten Soll-Stunden, Zeiträume und Aufbewahrungsfristen sind "
        + "betriebliche Voreinstellungen und keine rechtliche Aussage." },
    ],
  },
  {
    id: "grundsaetze",
    nummer: "24",
    titel: "Was das System nicht tut",
    kurz: "Die Grenzen, auf die man sich verlassen kann.",
    pfade: [],
    bloecke: [
      { art: "absatz", text:
        "Ein paar Grundsätze gelten überall und erklären viele Entscheidungen in der "
        + "Oberfläche. Wer sie kennt, versteht das System schneller." },
      { art: "liste", punkte: [
        "**Keine Rechtsberatung.** Das System erfasst Sachverhalte, Fristen und Nachweise. Es bewertet sie nicht und erzeugt keine Vertragstexte, Belehrungen oder Klauseln.",
        "**Es warnt und blockiert, es entscheidet nicht.** Wo eine Voraussetzung nachweislich fehlt, wird gesperrt. Wo es eine fachliche Abwägung ist, wird gewarnt und der Weg bleibt offen.",
        "**Keine erfundenen Zahlen.** Wo nichts erfasst ist, steht ein Strich oder „nicht berechenbar\" — keine Null, die wie ein Wert aussieht.",
        "**Keine Knöpfe ohne Funktion.** Was angezeigt wird, ist angebunden.",
        "**Keine automatischen Nachrichten.** Das System verschickt nichts ohne ausdrückliche Auslösung.",
        "**Nichts wird still verworfen.** Wird eine Eingabe nicht angenommen, sagt das System warum, statt sie kommentarlos zu verwerfen.",
        "**Löschen ist die Ausnahme.** Der Regelfall ist Archivieren.",
      ]},
      { art: "hinweis", text:
        "Eine Liste der Punkte, die vor dem Produktivgang anwaltlich abzunehmen sind, "
        + "wird getrennt geführt und ist nicht Teil dieser Anleitung." },
    ],
  },
];

// --- Zuordnung Seite → Kapitel ---------------------------------------------
// Aus `pfade` wird bestimmt, welches Kapitel zu einer geöffneten Seite gehört.
// Es gewinnt der längste passende Pfad, damit "/properties/:id/legal" gegenüber
// "/properties/:id" den Vorzug bekommt.

function passt(muster: string, pfad: string): boolean {
  const offen = muster.endsWith("*");
  const m = (offen ? muster.slice(0, -1) : muster).replace(/\/$/, "").split("/").filter(Boolean);
  const p = pfad.replace(/\/$/, "").split("/").filter(Boolean);
  if (offen ? p.length < m.length : p.length !== m.length) return false;
  return m.every((teil, i) => teil.startsWith(":") || teil === p[i]);
}

export function chapterForPath(pfad: string): HelpChapter | null {
  let treffer: HelpChapter | null = null;
  let tiefe = -1;
  for (const kapitel of HELP_CHAPTERS) {
    for (const muster of kapitel.pfade) {
      if (!passt(muster, pfad)) continue;
      const t = muster.split("/").filter(Boolean).length;
      if (t > tiefe) { tiefe = t; treffer = kapitel; }
    }
  }
  return treffer;
}
