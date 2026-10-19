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

// Stand der Anleitung: 13.10.2026, nach dem Umbau zum Programmrahmen
// (Modulleiste mit sieben Bereichen, Arbeitsplatz "Liste links, Akte rechts",
// Programmlisten). Die alten Bildschirmfotos zeigten noch den Seitenstreifen
// und sind entfernt; programmfenster.jpg ist eine Skizze des neuen Rahmens.
// Wo ein Kapitel einen Weg beschreibt, steht er in der Form
// "Bereich › Unterpunkt" -- so wie ihn die Statusleiste unten anzeigt.

export const HELP_TITLE = "Anleitung ZeyherMutterOS";
export const HELP_INTRO =
  "Diese Anleitung führt einmal durch den kompletten Verkaufsfall — vom ersten "
  + "Anruf eines Eigentümers bis zur Nachbetreuung nach der Übergabe. Sie ist in "
  + "der Reihenfolge geschrieben, in der die Arbeit tatsächlich anfällt. Wer "
  + "etwas Bestimmtes sucht, springt über das Inhaltsverzeichnis; wer neu "
  + "anfängt, liest Kapitel 1 und dann von vorne. Wege im Programm stehen als "
  + "„Bereich › Unterpunkt“ da, genau so, wie sie unten in der Statusleiste "
  + "angezeigt werden.";

export const HELP_CHAPTERS: HelpChapter[] = [
  {
    id: "grundlagen",
    nummer: "1",
    titel: "Aufbau und Bedienung",
    kurz: "Das Programmfenster: Bereiche, Arbeitsplatz, Listen, Suche, Glocke und Mein Tag.",
    pfade: ["/crm", "/crm/search", "/crm/notifications"],
    bloecke: [
      { art: "absatz", text:
        "Angemeldet wird über die Adresse des Systems mit der eigenen E-Mail-Adresse "
        + "und dem persönlichen Passwort. Es gibt keine Sammelzugänge: jede Änderung "
        + "wird dem angemeldeten Benutzer zugeschrieben und ist später in der "
        + "Systemhistorie nachvollziehbar." },
      { art: "absatz", text:
        "ZeyherMutterOS ist wie ein Arbeitsprogramm am PC aufgebaut, nicht wie eine "
        + "Webseite. Das Fenster hat auf jeder Seite dieselben sechs Teile:" },
      { art: "bild", datei: "programmfenster.jpg", breite: 1200, hoehe: 640, unterschrift:
        "Skizze des Programmfensters, hier im Bereich Immobilien. Die Ziffern "
        + "gehören zur Liste darunter." },
      { art: "schritte", punkte: [
        "**Titelleiste** (dunkelblau, ganz oben): links die Marke — ein Klick führt zu „Mein Tag“. Daneben das Suchfeld für Objekte, Adressen und Nummern. Rechts der Knopf **Hilfe**, die Glocke mit den Benachrichtigungen, die Umgebung (BETA ist das Testsystem), der angemeldete Benutzer und **Abmelden**.",
        "**Modulleiste** (links): die sieben Bereiche **Mein Tag, Adressen, Immobilien, Vermarktung, Abschluss, Auswertung** und abgesetzt darunter **Verwaltung**. Jeder Bereich hat eine eigene Farbe; der geöffnete ist ausgefüllt.",
        "**Bereichsleiste** (oben über der Arbeitsfläche): links der Name des Bereichs in seiner Farbe, daneben seine Unterpunkte als Reiter. Der geöffnete Unterpunkt ist unterstrichen.",
        "**Liste** (links in der Arbeitsfläche): alle Datensätze des Unterpunkts, mit Suchfeld zum Eingrenzen, „+ Neu“ zum Anlegen und unten „Volle Liste“ für die Tabellenansicht.",
        "**Akte** (rechts): der in der Liste gewählte Datensatz. Oben Nummer und Titel, darunter die Reiter der Akte und, wo es sie gibt, deren Unterseiten.",
        "**Statusleiste** (ganz unten): wo man gerade ist („Immobilien › Objekte“), als wer man angemeldet ist und der Stand der Programmversion.",
      ]},
      { art: "absatz", text:
        "Die sieben Bereiche und was darin steht:" },
      { art: "liste", punkte: [
        "**Mein Tag** (blau): Heute, In Bewegung, Aufgaben, Kalender, E-Mail, Benachrichtigungen, Suche.",
        "**Adressen** (petrol): Kontakte, Verkäufer-Leads, Verkaufsstrategie-Check, Suchprofile, Organisationen.",
        "**Immobilien** (grün): Objekte, Makleraufträge, Verkaufsprojekte, Aufmaß-Aufträge.",
        "**Vermarktung** (orange): Anfragen, Besichtigungen, Kampagnen & Gebiete, Website.",
        "**Abschluss** (ocker): Kaufangebote, Reservierungen, Abschlüsse & Notar, Provisionen.",
        "**Auswertung** (violett): Dashboard, Nachbetreuung, Empfehlungen, Case Studies.",
        "**Verwaltung** (grau): Anleitung, Geldwäsche & Aufbewahrung, Benutzer & Rollen, Weiterbildung, Anwaltsprüfung, Archiv, Systemhistorie.",
      ]},
      { art: "absatz", text:
        "**Der Arbeitsplatz: Liste links, Akte rechts.** Fast jeder Unterpunkt öffnet "
        + "sich so. Ein Klick auf eine Zeile links öffnet ihre Akte rechts, ohne dass "
        + "die Liste verschwindet; die geöffnete Zeile ist in der Farbe des Bereichs "
        + "hinterlegt. Das Suchfeld über der Liste grenzt beim Tippen ein. Gibt es "
        + "noch keinen Datensatz, steht rechts statt einer Akte das Formular für den "
        + "ersten." },
      { art: "absatz", text:
        "**Volle Liste.** Wer mehr Spalten braucht, sortieren oder nach Status "
        + "filtern will, öffnet unten links „Volle Liste“. Das ist die Programmliste: "
        + "oben eine Werkzeugleiste mit Suche und Filtern, darunter eine Zeile mit "
        + "Kennzahlen, dann die Tabelle. Ein Klick auf eine Zeile führt zurück in den "
        + "Arbeitsplatz mit der Akte rechts." },
      { art: "liste", punkte: [
        "Formulare zum Anlegen innerhalb einer Akte sind eingeklappt und beginnen mit „+“, etwa „+ Gebiet anlegen“ oder „+ Maßnahme erfassen“. Ein Klick klappt sie auf.",
        "Der Stand eines Datensatzes steht als farbiges Schildchen da: blau für alles, was gerade läuft (etwa Vermarktung, Reserviert, Notar), gelb für Vorbereitung und Wartendes, grün für Verkauft und Erledigtes, rot für Verloren, Abgelehntes und Überfälliges, grau für Entwürfe und Archiviertes. Die Farbe ist nie das einzige Merkmal — das Wort steht immer dabei.",
        "Die **Ampel** neben dem Status in den Listen von Kontakten, Leads, Objekten, Anfragen und Verkaufsprojekten zeigt den nächsten Schritt: rot mit „!“ überfällig, grün mit „●“ heute fällig, grau mit „○“ geplant (mit Datum), gelb mit „–“ kein nächster Schritt bei einem laufenden Vorgang. Als Schritt zählen offene Aufgaben, geplante Besichtigungen, die Wiedervorlage eines Leads und der nächste Schritt eines Verkaufsprojekts.",
        "**Stillstand** in Mein Tag: ein laufender Vorgang ohne echte Aktivität seit einer bestimmten Zahl von Tagen und ohne geplanten Schritt — neuer Lead 2 Tage, Lead in Bearbeitung 7, Lead bei Bewertung oder Angebot 14, Anfrage in Bearbeitung 3, Objekt in Vermarktung 14, Verkaufsprojekt 14. Echte Aktivität ist eine Notiz, ein Telefonat, eine E-Mail oder ein Termin im Verlauf (am Vorgang oder an seinem Kontakt) oder eine erledigte Aufgabe. Ein geändertes Feld oder ein automatischer Eintrag zählt nicht.",
        "Navy ist die Farbe der Handlung: „+ Neu“, „Speichern“ und andere Hauptknöpfe sind immer dunkelblau, egal in welchem Bereich.",
        "Jede Nummer im System ist eindeutig und sprechend: ZM-K für Kontakte, ZM-2026- für Immobilien, ZM-L für Verkäufer-Leads, ZM-A für Anfragen, ZM-T für Aufgaben, ZM-VP für Verkaufsprojekte, ZM-KA für Kaufangebote, ZM-VK für Abschlüsse, ZM-AM für Aufmaß-Aufträge.",
      ]},
      { art: "absatz", text:
        "**Mein Tag** ist die Startseite nach der Anmeldung (Mein Tag › Heute). Sie "
        + "beantwortet die Frage, was heute zu tun ist, in fünf Feldern: **Termine "
        + "heute** und in den nächsten Tagen, **Liegen geblieben** (überfällige "
        + "Aufgaben), **Stillstand**, **Fristen** der nächsten 14 Tage und **Neu eingegangen** "
        + "(neue Anfragen und Verkäufer-Leads). Lange Felder sind nach Datum gegliedert, "
        + "etwa „Morgen“, „Letzte 7 Tage“ oder „Überfällig“. Oben wird "
        + "umgeschaltet, wessen Tag gezeigt wird: **Meins**, der eines Kollegen oder "
        + "**Alle**. Darunter steht die Karte mit den Objektstandorten." },
      { art: "liste", punkte: [
        "Die **Suche** in der Titelleiste findet Kontakte, Immobilien, Leads, Anfragen, Aufgaben, Kaufangebote, Abschlüsse, Verkaufsprojekte und Besichtigungen über Namen, Adressen und Nummern. **Strg+K** (Mac: ⌘K) springt von überall hinein. Schon beim Tippen stehen die ersten Treffer darunter; Pfeiltasten wählen, Enter öffnet. Enter ohne Auswahl öffnet die volle Trefferliste (Mein Tag › Suche). Gibt es mehr Treffer, als angezeigt werden, steht das dabei.",
        "Die **Glocke** zeigt die Zahl ungelesener Benachrichtigungen. Ein Klick öffnet die Liste, ein Klick auf einen Eintrag springt zum betroffenen Vorgang und markiert ihn als gelesen. Alle Benachrichtigungen stehen unter Mein Tag › Benachrichtigungen.",
        "Steht in der Titelleiste **BETA**, ist es das Testsystem — dort darf gefahrlos geübt werden.",
      ]},
      { art: "hinweis", text:
        "Der Knopf **Hilfe** steht oben rechts in der Titelleiste, neben der Glocke. "
        + "Er öffnet genau das Kapitel dieser Anleitung, das die geöffnete Seite "
        + "beschreibt — als Fenster über der Seite, damit angefangene Eingaben nicht "
        + "verloren gehen. Aus dem Fenster heraus lässt sich die vollständige "
        + "Anleitung in einem eigenen Tab öffnen; sie steht außerdem unter "
        + "Verwaltung › Anleitung." },
    ],
  },
  {
    id: "alltag",
    nummer: "2",
    titel: "Aufgaben, Kalender, E-Mail und „In Bewegung“",
    kurz: "Wiedervorlagen, Termine, Nachrichten und was kurz vor dem Abschluss steht.",
    pfade: ["/crm/tasks", "/crm/calendar", "/crm/calendar/event.ics", "/crm/email", "/pipeline"],
    bloecke: [
      { art: "absatz", text:
        "Aufgaben sind der Motor des Systems. Fast alles, was eine Frist hat, legt "
        + "automatisch eine Aufgabe an: eine ablaufende Widerrufsfrist, eine offene "
        + "gerichtliche Genehmigung, eine überfällige Anfrage, ein Nachbetreuungsschritt "
        + "nach der Übergabe. Diese Aufgaben tauchen nicht aus dem Nichts auf — sie "
        + "hängen immer an einem Vorgang und verlinken dorthin." },
      { art: "liste", punkte: [
        "**Mein Tag › Aufgaben** zeigt offene und laufende Aufgaben als Programmliste, sortiert nach Fälligkeit. Überfällige sind hervorgehoben, die Priorität steht als Schildchen in der Zeile. Das Suchfeld findet Aufgaben über Nummer, Titel und Beschreibung. Es stehen 50 Aufgaben je Seite da; oben steht, wie viele es insgesamt sind, unten blättert man weiter.",
        "Oben wird wie auf „Heute“ umgeschaltet: **Meins**, ein Kollege oder **Alle**. Status und Umschalter bleiben stehen, wenn eine Aufgabe erledigt wird.",
        "**In jeder Akte dieselbe Aufgabenliste** — Kontakt, Objekt, Lead, Anfrage, Besichtigung und Suchprofil: oben **+ Aufgabe** (Titel und Fälligkeit genügen, Verantwortlich ist vorbelegt), jede offene Aufgabe mit einem Kreis zum **Abhaken in der Zeile**, Details und weitere Status über „Aufgabe öffnen“. Erledigte stehen zugeklappt darunter. Eine Aufgabe an der Besichtigung erscheint auch beim Kontakt, beim Objekt und bei der Anfrage. Gibt es am selben Vorgang schon eine offene Aufgabe mit gleichem Titel, fragt das Formular einmal nach — sollen zwei Personen dieselbe Aufgabe sehen, genügt eine Aufgabe mit einem Beobachter.",
        "Jede Aufgabe hat genau einen Verantwortlichen. Beobachter können zusätzlich eingetragen werden — sie bekommen Benachrichtigungen, sind aber nicht zuständig.",
      ]},
      { art: "absatz", text:
        "**Mein Tag › Kalender** zeigt alle neun Terminarten des Systems: Aufgaben, "
        + "Wiedervorlagen (Lead und Verkaufsprojekt), Eigentümertermine, Begehungen "
        + "zum Verkaufsstrategie-Check, Besichtigungen, Aufmaßtermine, Notartermine "
        + "und Übergaben. Er führt sie nur zusammen — gepflegt wird jeder Termin an "
        + "seinem Vorgang." },
      { art: "liste", punkte: [
        "Neben der Terminliste steht das Monatsraster, mit Pfeilen zum vorigen und nächsten Monat. Jeder Termin ist dort eine Marke in der Farbe seiner Art; ein Klick auf einen Tag springt in der Liste dorthin.",
        "Über „Wessen Termine“ wird zwischen den eigenen, denen eines Kollegen und allen umgeschaltet.",
        "Einzelne Termine lassen sich als .ics-Datei in Outlook oder einen anderen Kalender übernehmen.",
      ]},
      { art: "absatz", text:
        "**Mein Tag › E-Mail** bereitet eine Nachricht mit Bezug zu einem Kontakt, "
        + "Lead oder einer Anfrage vor und hält fest, was geschrieben wurde. Am "
        + "schnellsten geht es über den Knopf **E-Mail** oben rechts in der Akte eines "
        + "Kontakts, Leads oder einer Anfrage: dann ist der Bezug schon vorbelegt. "
        + "Ohne Bezug zeigt der Unterpunkt das Journal aller erfassten E-Mails. Versendet wird im "
        + "eigenen E-Mail-Programm." },
      { art: "liste", punkte: [
        "**E-Mail schreiben**: Eine Vorlage des Büros füllt Betreff und Text vor; Platzhalter wie {{anrede}} oder {{objekt_titel}} werden aus der Akte gesetzt. Bleibt ein Platzhalter ohne Wert, weist die Seite darauf hin. Ohne Vorlage bleibt der Text leer — das CRM schreibt keine Sätze an Kunden.",
        "Bei einer Anfrage zu einem Objekt mit einem **zur Verwendung freigegebenen Exposé** lässt es sich als PDF herunterladen (zum Anhängen) oder als kurzen Link einfügen. Der Link ist 14 Tage gültig; wer ihn hat, kann das PDF öffnen. Er wird erst auf Klick erzeugt und lässt sich unter **Ausgegebene Links** jederzeit zurückziehen; danach zeigt er nur noch „nicht mehr gültig“. Er gilt auch nicht mehr, sobald das Exposé nicht mehr zur Verwendung freigegeben ist. Ob ein Link geöffnet wurde, wird nicht erfasst.",
        "**Im Mailprogramm öffnen** übergibt Empfänger, Betreff und Text. Sehr lange Texte kürzen manche Mailprogramme — dafür gibt es „Text kopieren“.",
        "**Gesendet – festhalten** dokumentiert die E-Mail im Verlauf. War ein Exposé dabei, wird zugleich der **Objektnachweis** gespeichert (Weg „Exposé per E-Mail“, mit Exposé-Nummer). Bei einer neuen Anfrage setzt ein Haken sie auf „Kontaktiert“. Was nicht gespeichert werden konnte, meldet die Seite einzeln.",
        "**E-Mail nachträglich erfassen** bleibt für empfangene E-Mails und alles, was anders entstanden ist.",
        "**Verwaltung › E-Mail-Vorlagen**: Vorlagen anlegen, ändern und abschalten (wer die Verwaltung pflegen darf). Das CRM liefert und prüft keine Texte; Aussagen zu Provision, Widerruf oder anderen Rechtsfolgen gehören nur nach eigener bzw. anwaltlicher Freigabe hinein.",
      ]},
      { art: "absatz", text:
        "**Mein Tag › In Bewegung** zieht zusammen, was kurz vor dem Abschluss steht: "
        + "ablaufende Kaufangebote, endende Reservierungen, anstehende Notartermine "
        + "und fällige Kaufpreise. Die Liste ist nach Datum gegliedert — Überfällig, "
        + "Diese Woche, Später und Ohne Frist. Sie legt nichts an und ändert nichts; "
        + "jede Zeile führt in die Akte, in die der Vorgang gehört." },
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
    pfade: ["/crm/contacts*", "/crm/organizations", "/crm/organizations/:organizationId"],
    bloecke: [
      { art: "absatz", text:
        "Jede Person im System ist ein Kontakt — Eigentümer, Interessent, Käufer, "
        + "Miterbe, Betreuer, Mieter, Notar, Handwerker. Ein Kontakt wird einmal "
        + "angelegt und danach über Rollen mit Vorgängen verknüpft. Dieselbe Person "
        + "kann gleichzeitig Verkäufer bei einem Objekt und Interessent bei einem "
        + "anderen sein." },
      { art: "schritte", punkte: [
        "**Adressen › Kontakte** öffnen. Links steht die Kontaktliste, rechts die Akte des gewählten Kontakts.",
        "Über der Liste „+ Neu“. Beim Anlegen genügen Vor- und Nachname; alles weitere kann später ergänzt werden.",
        "Das System prüft beim Speichern auf mögliche Dubletten und weist darauf hin, statt stillschweigend eine zweite Karteileiche anzulegen.",
        "Oben rechts in der Kontaktakte öffnet **E-Mail** das Mailprogramm und hält die E-Mail danach am Kontakt fest. Aktivitäten am Verkäufer-Lead erscheinen auch im Verlauf des Kontakts.",
        "Die Kontaktakte öffnet mit der **Übersicht**: wer die Person für das Büro ist (Suchprofil, eigenes Objekt, Verkaufsinteresse), Telefon und E-Mail zum Antippen, die Zahl passender Objekte und offener Aufgaben, der **nächste Schritt** (das früheste Datum aus Aufgaben, Besichtigungen, Wiedervorlagen und unbeantworteten Anfragen), alle laufenden Vorgänge mit Stand und der letzte Kontakt. Die Übersicht ändert nichts; jede Zeile führt in die zugehörige Akte.",
        "**Datenauskunft** (Kontakt › Übersicht › Datenschutz): alles, was das CRM zu einer Person speichert — Stammdaten, Einwilligungen aus Website-Formularen mit Zeitpunkt und Textfassung und jeder Bereich, der auf den Kontakt zeigt (Anfragen, Besichtigungen, Verlauf, Dokumente als Angaben, Geldwäsche-Identifizierung …). Zum Drucken bzw. als PDF speichern oder als Datei (JSON). Bereiche, die nicht gelesen werden konnten, stehen ausdrücklich dabei. Das Herunterladen der Datei wird im Verlauf festgehalten. Ob und wie eine Auskunft zu erteilen ist, beantwortet das CRM nicht.",
        "**Rechtsgrundlage und Werbewiderspruch** (Datenauskunft › Datenschutz-Angaben): je Kontakt die vom Büro gewählte Grundlage der Verarbeitung mit Notiz und das Datum eines Werbewiderspruchs. „E-Mail schreiben“ weist bei einem Widerspruch darauf hin, sperrt aber nicht — ob eine Nachricht Werbung ist, entscheidet das Büro. Das CRM prüft die gewählte Grundlage nicht.",
        "**Anonymisieren auf Antrag** (nur mit dem Recht „Kontakte anonymisieren“, standardmäßig Geschäftsführung und Verwaltung): überschreibt Name, Erreichbarkeit, Anschriften, Notizen und Freitexte zur Person und schwärzt sie im Änderungsprotokoll; Vorgänge und Zahlen bleiben ohne Personenbezug, der Kontakt wird archiviert. Nur mit Grund und eingetippter Kontaktnummer, protokolliert, nicht umkehrbar. Gesperrt, solange Dokumente (auch mit Aufbewahrungsfrist oder Sperrvermerk), eine Geldwäsche-Identifizierung oder ein in eine Immobilie umgewandelter Lead am Kontakt hängen — die Gründe stehen dabei.",
        "**Tägliche Automatik** (Verwaltung › Automatik): Jeden Morgen gegen 06:30 Uhr (Winterzeit 05:30 Uhr) legt das CRM Aufgaben und Benachrichtigungen an – unbeantwortete Anfragen eskalieren, Reservierung oder Maklerauftrag endet in 7 Tagen, Lead-Wiedervorlage fällig, nächste Geldwäsche-Risikoprüfung, Aufbewahrung läuft ab (an die Geschäftsführung) und passende Suchprofile, wenn ein Objekt in die Vermarktung geht oder sein Preis sich ändert. Es verschickt nichts, ändert keinen Status und entfernt nichts. Jede Regel meldet denselben Anlass nur einmal und lässt sich einzeln ausschalten; die letzten Läufe stehen mit Ergebnis und Fehlern auf der Seite.",
        "Dahinter vier Reiter: **Stammdaten** (Name, Erreichbarkeit, Empfehlungen, Historie), **Rollen & Aufgaben** (Rollen an Vorgängen, verbundene Personen wie Ehepartner, Miterben oder Bevollmächtigte, offene Aufgaben), **Adressen & Firmen** (nachgewiesene Objekte, Organisationen, Anschriften) und **Verlauf** (Aktivitäten, Kommentare und @Erwähnungen).",
      ]},
      { art: "absatz", text:
        "Organisationen sind Firmen und Partner: Notariate, Handwerksbetriebe, "
        + "Fotografen, Hausverwaltungen. Sie stehen unter **Adressen › "
        + "Organisationen**, ebenfalls als Liste links und Akte rechts. Die "
        + "Organisationsakte hat die Reiter **Stammdaten** und **Partner & "
        + "Compliance**; im zweiten wird bei Partnern, die Empfehlungen aussprechen, "
        + "das Partnerprofil geführt — mehr dazu im Kapitel über Kampagnen und "
        + "Partner." },
      { art: "absatz", text:
        "Wo in einem Formular ein Kontakt gewählt wird — etwa ein Eigentümer oder eine "
        + "Beziehung —, tippt man zwei Zeichen von Name, Nummer, E-Mail oder Telefon. "
        + "Das System sucht dann im ganzen Bestand und zeigt bis zu 20 Treffer." },
      { art: "hinweis", text:
        "Kontakte werden nicht gelöscht, sondern archiviert. Sie verschwinden dann "
        + "aus allen Auswahllisten, bleiben aber in abgeschlossenen Vorgängen "
        + "sichtbar. Archivierte Datensätze stehen unter Verwaltung › Archiv." },
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
        + "Er entsteht entweder von Hand oder automatisch aus einer Anfrage über die "
        + "Website — Bewertung oder Verkaufsstrategie-Check. Der Lead ist die "
        + "Vorstufe: hier wird geklärt, ob überhaupt ein Verkauf ansteht." },
      { art: "absatz", text:
        "Die Leads stehen unter **Adressen › Verkäufer-Leads**. Die Leadakte rechts "
        + "hat zwei Reiter: **Lead** mit Angaben zum möglichen Auftrag, Herkunft, "
        + "Verantwortlichem, Aufgaben und Aktivitäten, und **Verkaufsstrategie-Check** "
        + "für den Check zu diesem Eigentümer." },
      { art: "liste", punkte: [
        "Der Stand führt von „Neu“ über „Kontaktiert“ und „Qualifiziert“ bis zu „Gewonnen“ oder „Kein weiteres Interesse“.",
        "„Kein weiteres Interesse“ verlangt einen Grund. Ohne Grund wird nicht gespeichert — das ist Absicht, weil die Gründe später ausgewertet werden.",
        "Jeder Lead hat eine Wiedervorlage. Ohne Wiedervorlage geht ein Lead in der Praxis verloren.",
        "Mit „Auftrag übernehmen“ entsteht aus dem Lead eine Immobilie und ein Verkaufsprojekt. Die erfassten Geschäftsdaten werden dabei eingefroren, damit später nachvollziehbar bleibt, mit welchen Angaben gestartet wurde.",
      ]},
      { art: "hinweis", text:
        "Der Lead bleibt nach der Umwandlung bestehen und verweist auf die "
        + "entstandene Immobilie. Es entsteht keine Dublette." },
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
      { art: "absatz", text:
        "Die Kampagnen stehen unter **Vermarktung › Kampagnen & Gebiete**: links die "
        + "Kampagnenliste, rechts die Kampagnenakte mit den Abschnitten Kampagne, "
        + "Wellen und Zugeordnete Leads. Die Gebiete und das Formular für eine neue "
        + "Kampagne stehen in der „Volle Liste“." },
      { art: "schritte", punkte: [
        "Zuerst ein Gebiet anlegen: in der „Volle Liste“ über „+ Gebiet anlegen“. Gebiete lassen sich schachteln, etwa München → Trudering → Waldtrudering.",
        "Dann über „+ Neu“ eine Kampagne im Gebiet: Zielgruppe, Anzahl angeschriebener Haushalte, Zeitraum, Kosten, Werbemittel, Thema.",
        "In der Kampagnenakte einzelne Wellen erfassen („Welle anlegen“). Eine Welle darf nicht vor dem Kampagnenstart liegen.",
        "Beim Lead die Herkunft eintragen: Kampagne, Welle, empfehlender Partner, Reaktionsweg und -datum.",
      ]},
      { art: "absatz", text:
        "Partner werden in der Organisationsakte unter dem Reiter **Partner & "
        + "Compliance** geführt (Adressen › Organisationen). Dort steht ein "
        + "Compliance-Kennzeichen: Provision grundsätzlich möglich, keine Provision, "
        + "rechtliche Prüfung erforderlich, oder nur Kooperation ohne Vergütung. Für "
        + "regulierte Berufsgruppen — Rechtsanwälte, Notare — verweigert das System "
        + "die Erfassung einer Vergütung und nennt den Grund im Klartext." },
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
        + "es um einen Fall steht, öffnet das Projekt und nicht sechs Einzellisten. "
        + "Die Projekte stehen unter **Immobilien › Verkaufsprojekte**." },
      { art: "absatz", text:
        "Zwei Karten stehen in der Projektakte oben. **Nächste Aktion** nennt genau "
        + "eine Sache mit Fälligkeit und Verantwortlichem — nicht drei, sondern eine. "
        + "**Offene Punkte** führt zusammen, was dem Vermarktungsstart noch im Weg "
        + "steht: Maßnahmen, Vermarktungsreife, Pflichtangaben, "
        + "Verfügungsberechtigung und Maklerauftrag. Jeder Punkt verlinkt an die "
        + "Stelle, wo er zu erledigen ist." },
      { art: "absatz", text:
        "Darunter folgen Projekt (Stammdaten), Stand, der zugehörige "
        + "Verkaufsstrategie-Check und „Auftrag, Vermarktung, Abschluss“ mit den "
        + "Verweisen in die Vorgänge. Ein neues Projekt entsteht meist aus einem Lead "
        + "(„Auftrag übernehmen“); von Hand über „+ Neu“ in der Liste." },
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
      { art: "absatz", text:
        "Alle Checks stehen unter **Adressen › Verkaufsstrategie-Check**. Bearbeitet "
        + "wird ein Check in der Leadakte des Eigentümers, Reiter "
        + "**Verkaufsstrategie-Check**. Oben steht, was zur Prüfbereitschaft noch "
        + "fehlt." },
      { art: "schritte", punkte: [
        "Ausgangssituation, Verkaufsziel und Besichtigungsdatum erfassen.",
        "Szenarien anlegen — typischerweise „ohne Aufbereitung“, „kleine Maßnahmen“, „umfassende Aufbereitung“. Je Szenario Preisspanne, Investition und Dauer.",
        "Genau ein Szenario empfehlen. Auch „nicht empfohlen“ ist eine zulässige Empfehlungsstufe und oft die ehrlichste.",
        "Maßnahmen erfassen und dem Szenario zuordnen. Was bei der Begehung an Heizung, Elektrik oder Photovoltaik auffällt, gehört als eigene Maßnahme hierher — die Website kündigt diese technische Einschätzung ausdrücklich an.",
        "Den Check zur Prüfung markieren und anschließend finalisieren. Danach ist er unveränderlich; eine fachliche Änderung erzeugt eine neue Revision.",
        "Die Entscheidung des Eigentümers dokumentieren.",
      ]},
      { art: "warnung", text:
        "Alle Zahlen im Check sind ausdrücklich Einschätzungen und keine Zusicherung. "
        + "Das steht auch so in der Oberfläche und gehört im Gespräch mit dem "
        + "Eigentümer genauso gesagt. Die technische Einschätzung ist kein Gutachten "
        + "und keine Fachplanung." },
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
    kurz: "Die Immobilie anlegen, ihre neun Reiter und die Statusstufen.",
    pfade: [
      "/properties", "/properties/new", "/properties/:propertyId",
      "/properties/:propertyId/objektdaten", "/properties/:propertyId/eigentuemer",
      "/properties/:propertyId/verlauf",
    ],
    bloecke: [
      { art: "absatz", text:
        "Die Objektakte ist die zentrale Akte einer Immobilie. Sie steht unter "
        + "**Immobilien › Objekte**: links die Objektliste mit dem Stand jedes "
        + "Objekts, rechts die Akte. Eine neue Immobilie entsteht über „+ Neu“ oder "
        + "aus einem Lead." },
      { art: "absatz", text:
        "Die Akte hat neun Reiter, die immer gleich dastehen. Unter manchen Reitern "
        + "stehen mehrere Seiten als kleine Unterreiter:" },
      { art: "liste", punkte: [
        "**Übersicht** — oben die Karte „auf einen Blick“: Preis (bei Vermietung die Kaltmiete), Flächen und Zimmer, die Eigentümer mit Telefon, die Zahl der Interessenten (jede Person mit Anfrage, Besichtigung oder Kaufangebot, einmal gezählt), offene Anfragen, anstehende Besichtigungen, laufende Kaufangebote, offene Aufgaben und Dokumente sowie das, was als Nächstes fällig ist. Dort klappt auch **Status ändern** auf. Darunter folgen Fahrplan, Anfragen & Besichtigungen, letzte Aktivitäten, offene Aufgaben, dann Pflichtangaben und Checkliste, Verfügungsberechtigung, Recht & Lasten, Geldwäsche, Preis & Wert sowie WEG & Miete.",
        "**Objektdaten** — Basisdaten & Ausstattung, WEG & Miete, Pflichtangaben.",
        "**Eigentümer & Recht** — Eigentümer, Recht & Lasten, Verfügungsberechtigung.",
        "**Preis & Wert** — Preisverlauf und Wertermittlung.",
        "**Unterlagen** — Unterlagenliste und Dokumente.",
        "**Vermarktung** — Medien, Exposés, Portale, Website.",
        "**Interessenten** — Interessenten & Besichtigungen zu diesem Objekt.",
        "**Abwicklung** — Geldwäsche, dazu die Verweise in die Vorgänge dieses Objekts: Maklerauftrag, Aufmaß, Kaufangebote, Reservierungen, Abschluss & Notar, Provisionen. Diese öffnen ihre eigene Akte.",
        "**Verlauf** — die Objekthistorie.",
      ]},
      { art: "absatz", text:
        "Der Objektstatus läuft: Entwurf → Akquise → Bewertung → Auftrag ausstehend → "
        + "Vorbereitung → Vermarktung → Reserviert → Notar → Verkauft. Daneben gibt es "
        + "Verloren, Zurückgezogen und Archiviert. Der Stand steht als farbiges "
        + "Schildchen in der Liste und im Kopf der Akte." },
      { art: "warnung", text:
        "Der Schritt von Vorbereitung nach Vermarktung ist gesperrt, solange die "
        + "Vermarktungsreife nicht erreicht ist. Die Checkliste in der Übersicht "
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
        "Beides steht in der Objektakte unter dem Reiter **Eigentümer & Recht**, "
        + "neben der Seite Eigentümer." },
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
        "Das System nennt jederzeit den Stand: „Verfügungsberechtigung geklärt“ oder "
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
        "Objektakte, Reiter **Preis & Wert**. Jede Preisänderung wird als eigene "
        + "Stufe erfasst — mit Datum, altem und neuem Wert, Begründung und "
        + "Verantwortlichem. Das System zählt je Stufe automatisch mit: Tage im "
        + "Markt, Anfragen, Besichtigungen, Kaufangebote. Damit lässt sich im "
        + "Rückblick belegen, warum ein Preis wann geändert wurde." },
      { art: "absatz", text:
        "Die Wertermittlung hält das Verfahren fest — Vergleichswert, Ertragswert, "
        + "Sachwert oder Marktpreiseinschätzung —, dazu Bewertungsdatum, Bewerter, "
        + "Bodenrichtwert mit Stichtag und Quelle, herangezogene Vergleichsobjekte und "
        + "die Ergebnisspanne." },
      { art: "absatz", text:
        "Das Besichtigungsfeedback wird je Objekt verdichtet: „von zwölf "
        + "Besichtigungen halten neun den Preis für zu hoch“ ist ein Satz, mit dem "
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
        "Objektakte, Reiter **Objektdaten › WEG & Miete**. Für Eigentumswohnungen: "
        + "Miteigentumsanteil, Hausgeld gesamt und getrennt nach Umlage und Rücklagenanteil "
        + "(nur hier gepflegt; bleibt das Gesamtfeld leer, wird die Summe der beiden Teile übernommen), "
        + "Höhe der Erhaltungsrücklage, beschlossene und absehbare Sonderumlagen mit "
        + "Betrag und Zweck, Sondernutzungsrechte, Verwalter mit Vertragslaufzeit, "
        + "Beschlusssammlung, Wirtschaftsplan, Jahresabrechnung und anstehende "
        + "Sanierungen." },
      { art: "absatz", text:
        "Für vermietete Objekte: Mietvertragsdatum und -art, Ist-Kaltmiete, "
        + "Nebenkostenvorauszahlung, Kaution, Staffel- oder Indexmiete, "
        + "Kündigungsverzicht, laufende Mieterhöhung, Mietrückstände, Untervermietung, "
        + "der Mieter als Kontakt, Mietervorkaufsrecht und Sperrfrist nach Umwandlung." },
      { art: "hinweis", text:
        "Die Bruttomietrendite erscheint nur, wenn die Grunddaten vollständig sind. "
        + "Sonst steht dort „nicht berechenbar“ — eine Rendite auf halber Datenlage "
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
        "Objektakte, Reiter **Objektdaten › Pflichtangaben**. Vor dem Wechsel in die "
        + "Vermarktung und vor jeder Veröffentlichung prüft das System die Angaben, "
        + "die eine Immobilienanzeige tragen muss. Ein grüner Balken bestätigt "
        + "Vollständigkeit — nicht rechtliche Richtigkeit." },
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
        "Der Maklerauftrag ist ein eigener Vorgang, kein bloßes Dokument. Er steht "
        + "unter **Immobilien › Makleraufträge** und ist aus der Objektakte über den "
        + "Reiter **Abwicklung** erreichbar. Erfasst werden Auftraggeber, Objekt, "
        + "Auftragsart — einfacher Auftrag, Alleinauftrag oder qualifizierter "
        + "Alleinauftrag —, Vertragsschluss mit Datum und Form, Laufzeit, "
        + "Verlängerungsregel, Kündigung und tatsächliches Ende." },
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
      { art: "hinweis", text:
        "Die Startseite der Website beantwortet die Kostenfragen der Eigentümer — "
        + "Provision, wer sie zahlt, Fälligkeit, Laufzeit und Kündigung — in "
        + "allgemeiner Form. Was im Gespräch und im Auftrag konkret vereinbart wird, "
        + "muss dazu passen. Die Formulierungen dort sind mit dem Anwalt abzustimmen." },
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
        "Je Verkaufsimmobilie wird eine Geldwäscheakte geführt — in der Objektakte "
        + "unter **Abwicklung › Geldwäsche**. Erfasst werden die Identifizierung von "
        + "Verkäufer- und Käuferseite mit Ausweisart, Nummer, ausstellender Behörde, "
        + "Gültigkeit, Datum, identifizierender Person und Verfahren; der "
        + "wirtschaftlich Berechtigte bei juristischen Personen; die "
        + "Risikoeinstufung mit Begründung und Prüfdatum; der dokumentierte Abgleich "
        + "mit PEP- und Sanktionslisten; die Herkunft der Mittel; der Nachweis der "
        + "unbaren Zahlung." },
      { art: "absatz", text:
        "Die Übersicht über alle Geldwäscheakten steht unter **Verwaltung › "
        + "Geldwäsche & Aufbewahrung**, zusammen mit den ablaufenden "
        + "Aufbewahrungsfristen, den Aufbewahrungsregeln und der Liste dessen, was "
        + "vor dem Produktivbetrieb anwaltlich abzunehmen ist." },
      { art: "warnung", text:
        "Diese Daten sind besonders geschützt. Sie sind nur für Rollen mit "
        + "ausdrücklicher Berechtigung sichtbar, und jeder Zugriff wird protokolliert. "
        + "Ausweisdaten gehören nicht in freie Notizfelder." },
      { art: "absatz", text:
        "Vor der Beurkundung warnt die Abschlussakte, wenn die Identifizierung beider "
        + "Seiten nicht dokumentiert ist. Der Hinweis blockiert den Vorgang nicht und "
        + "stellt nicht fest, ob eine Pflicht besteht." },
      { art: "absatz", text:
        "Unter „Löschreife und Lücken“ steht, welche Unterlagen löschreif sind, "
        + "welche kein Löschdatum haben und für welche Dokumentarten überhaupt keine "
        + "Aufbewahrungsregel hinterlegt ist. Einen Löschknopf gibt es bewusst nicht: "
        + "wie lange aufzubewahren ist, ist eine rechtliche Frage." },
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
        "Objektakte, Reiter **Unterlagen** mit den Seiten **Unterlagenliste** und "
        + "**Dokumente**; die Bilder stehen unter **Vermarktung › Medien**." },
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
        + "sondern was noch fehlt. Sie führt je Objekt eine Zeile pro Unterlage mit "
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
    kurz: "Vom internen Objekt zur öffentlichen Anzeige — und die Seiten der Website pflegen.",
    pfade: [
      "/properties/:propertyId/publication",
      "/properties/:propertyId/publication/preview",
      "/properties/:propertyId/exposes*",
      "/properties/:propertyId/marketing",
      "/crm/website*",
    ],
    bloecke: [
      { art: "absatz", text:
        "Objektakte, Reiter **Vermarktung** mit den Seiten Medien, Exposés, Portale "
        + "und Website. Die Website liest niemals direkt aus der Objektakte. Sie "
        + "liest eine freigegebene, unveränderliche Version. Eine interne Korrektur "
        + "ändert die laufende Anzeige also nicht von selbst — das ist "
        + "anzeigenrechtlich wichtig und in der Praxis beruhigend." },
      { art: "schritte", punkte: [
        "Unter **Vermarktung › Website** öffentlichen Titel, URL-Kürzel, Untertitel, Kurztext und Objektbeschreibung erfassen.",
        "Die Vorschau prüfen — sie ist intern und veröffentlicht nichts.",
        "Freigeben. Erst damit entsteht die öffentliche Version.",
        "Wird intern etwas geändert, weist das System auf unveröffentlichte Änderungen hin und verlangt eine neue Freigabe.",
      ]},
      { art: "absatz", text:
        "Exposés werden aus einer konkreten Publikationsversion erzeugt und ebenfalls "
        + "versioniert. In ein Exposé kommen nur Bilder und Grundrisse, die unter "
        + "**Medien** für die Veröffentlichung freigegeben sind; interne Fotos bleiben "
        + "draußen, auch im PDF. Unter **Portale** wird je Kanal festgehalten, wo das Objekt "
        + "läuft. Es gibt keine vorgetäuschte Portalanbindung — geschaltet wird beim "
        + "Portal, dokumentiert wird hier." },
      { art: "absatz", text:
        "**Die Seiten der Website** — Startseite, Über uns, Kontakt, Ratgeber, "
        + "Impressum und die übrigen — werden unter **Vermarktung › Website** "
        + "gepflegt. Links stehen alle Seiten mit ihrem Stand, rechts die gewählte "
        + "Seite mit den Abschnitten **Inhalte bearbeiten**, **Vorschau & Live** und "
        + "**Versionen**." },
      { art: "schritte", punkte: [
        "Texte unter „Inhalte bearbeiten“ ändern und mit „Entwurf speichern“ sichern. Der Entwurf ist noch nicht öffentlich.",
        "„Vorschauversion erstellen“ und die Vorschau prüfen.",
        "„Version … veröffentlichen“. Erst jetzt ändert sich die öffentliche Seite.",
      ]},
      { art: "hinweis", text:
        "Solange eine Seite noch nie veröffentlicht wurde, zeigt die Website die "
        + "Grundtexte aus dem Programm. Eine veröffentlichte Version bleibt dagegen "
        + "stehen, bis eine neue veröffentlicht wird — auch wenn sich die Grundtexte "
        + "inzwischen geändert haben. Neue Felder einer Seite (etwa der Fragen-Block "
        + "zu den Maklerkosten auf der Startseite) zeigen bis dahin ihren Grundtext." },
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
        + "mit nachvollziehbaren Gründen, nicht als Punktzahl aus einer Blackbox. "
        + "Suchprofile stehen unter **Adressen › Suchprofile**; Suchaufträge von "
        + "der Website kommen dort ebenfalls an." },
      { art: "absatz", text:
        "Anfragen stehen unter **Vermarktung › Anfragen**. Sie kommen über Website, "
        + "Portal, Telefon oder persönlich herein. Je Kanal ist eine Zielzeit "
        + "hinterlegt — für einen Rückruf kürzer als für eine Portalanfrage. In der "
        + "„Volle Liste“ zeigt der Abschnitt Reaktionszeit, wo die Zielzeit "
        + "überschritten ist, und „Überfällige eskalieren“ legt je überfälliger "
        + "Anfrage genau eine Wiedervorlage an, einmalig und nur auf Knopfdruck. "
        + "Wer eine Anfrage öffnet, liest zuerst die **Nachricht** des Interessenten; "
        + "daneben stehen **Anrufen** und **Antworten** — die Antwort-E-Mail wird am "
        + "Kontakt festgehalten." },
      { art: "absatz", text:
        "**Anfrage einfügen** (Knopf in der Anfrageliste, auch über Strg+K): Den Text "
        + "einer Portal- oder E-Mail-Anfrage einfügen und „Auswerten“ drücken. Der "
        + "Assistent liest beschriftete Zeilen wie „Vorname:“, „E-Mail:“, „Telefon:“ "
        + "und „Nachricht:“, dazu E-Mail-Adressen, Telefonnummern, Objektnummern und "
        + "Postleitzahlen — ohne KI, nichts verlässt das CRM. Er schlägt einen "
        + "vorhandenen Kontakt vor (gleiche E-Mail, Mobilnummer oder Name) und ein "
        + "passendes Objekt. Jedes Feld ist markiert: „aus beschrifteter Zeile“, „bitte "
        + "prüfen“ oder „nicht erkannt“. Gespeichert wird erst mit **Anfrage anlegen**: "
        + "bei Bedarf der neue Kontakt, die Anfrage, auf Wunsch eine Wiedervorlage in "
        + "drei Tagen; danach geht es direkt zu „E-Mail schreiben“. Einen Namen aus "
        + "freiem Text rät der Assistent nicht." },
      { art: "absatz", text:
        "Das Kontaktformular der Website legt eine Anfrage an. Oben in der Nachricht "
        + "steht das gewählte Anliegen. Bittet jemand um Rückruf, steht dort auch das "
        + "gewünschte Zeitfenster — vormittags, nachmittags oder abends — mit der "
        + "Telefonnummer. Angerufen wird dann im gewünschten Zeitfenster." },
      { art: "absatz", text:
        "Besichtigungen stehen unter **Vermarktung › Besichtigungen** und werden mit "
        + "Termin, Treffpunkt und Teilnehmern geplant. Danach wird das Feedback "
        + "erfasst: Interessenniveau, Positives, Bedenken, Preisrückmeldung und "
        + "nächster Schritt. Dieses Feedback fließt in die Preisauswertung ein." },
      { art: "hinweis", text:
        "Im Reiter **Interessenten** der Objektakte steht dasselbe aus Sicht der "
        + "Immobilie: wem sie nachgewiesen wurde und wer sie gesehen hat." },
    ],
  },
  {
    id: "angebote",
    nummer: "18",
    titel: "Kaufangebote und Reservierung",
    kurz: "Vom Angebot bis zur reservierten Immobilie.",
    pfade: ["/purchase-offers*", "/reservations*"],
    bloecke: [
      { art: "absatz", text:
        "Kaufangebote stehen unter **Abschluss › Kaufangebote**. Ein Angebot trägt "
        + "Betrag, Gültigkeit, Abgabedatum und Notizen. Je Interessent und Objekt ist "
        + "immer nur ein Angebot aktiv; ein Folgeangebot ersetzt das vorige "
        + "ausdrücklich, statt es zu überschreiben. Damit bleibt die Verhandlung "
        + "nachvollziehbar." },
      { art: "absatz", text:
        "Beim Anlegen zeigt das System den zugehörigen Objektnachweis an — oder "
        + "markiert deutlich, dass keiner vorliegt." },
      { art: "absatz", text:
        "Reservierungen stehen unter **Abschluss › Reservierungen**, links die "
        + "Liste, rechts die Reservierungsakte. Eine Reservierung hält Interessent, "
        + "Objekt, Zeitraum, reservierten Preis, Bedingungen und ein etwa "
        + "verknüpftes Kaufangebot fest. Angelegt wird über „+ Neu“." },
      { art: "liste", punkte: [
        "In der Akte oben: „Wiedervorlage zum Ablauf“ legt eine Aufgabe zum Enddatum an; „Archivieren“ nimmt die Reservierung aus der Liste.",
        "Im Abschnitt **Bearbeiten** werden Enddatum, Preis, Vereinbarung, Entgelt, Kaufangebot und Bedingungen geändert.",
        "Im Abschnitt **Reservierung beenden** wird das Ergebnis gewählt: Abgelaufen, In Verkauf übergegangen oder Aufgehoben. Eine Aufhebung verlangt einen Grund.",
        "Was demnächst endet, steht auch unter Mein Tag › In Bewegung.",
      ]},
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
        + "Eigentumsumschreibung zusammen, damit dafür keine Nebenliste nötig ist. "
        + "Sie steht unter **Abschluss › Abschlüsse & Notar** und hat zwei Reiter: "
        + "**Abschluss** (Verkaufskontext, Dokumente & Provisionen, Notar und "
        + "Termine, Nachbetreuung, nächste Schritte, Historie) und **Meilensteine & "
        + "Übergabe**." },
      { art: "absatz", text:
        "Vor der Beurkundung stehen oben in der Akte zwei Warnungen, solange sie "
        + "offen sind: zur Verfügungsberechtigung und zur Geldwäsche-Identifizierung "
        + "beider Seiten." },
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
        + "abgeschlossen. Der Objektstatus „Verkauft“ bleibt davon unberührt." },
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
        "Provisionen stehen unter **Abschluss › Provisionen**. Eine Provision erbt "
        + "die Konditionen aus dem Maklerauftrag, bleibt aber einzeln übersteuerbar. "
        + "Sie wird getrennt nach Innen- und Außenseite geführt, wahlweise als "
        + "Prozentsatz oder Festbetrag." },
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
        + "lassen sich unter **Auswertung › Nachbetreuung** anpassen." },
      { art: "absatz", text:
        "Unter **Auswertung › Empfehlungen** wird festgehalten, wer wen empfohlen hat "
        + "und was daraus geworden ist. Das koppelt auf das Partnerprofil zurück." },
      { art: "absatz", text:
        "Eine Case Study (**Auswertung › Case Studies**) wird aus den vorhandenen "
        + "Daten aufgebaut: Ausgangszustand, ursprüngliche Preiseinschätzung, "
        + "durchgeführte Maßnahmen, Investitionssumme, Dauer der Aufbereitung, "
        + "Vermarktungsdauer, Verkaufspreis, Vorher-/Nachher-Medien und Lessons "
        + "Learned. Empfehlungen und Case Studies werden über „+ Neu“ in der Liste "
        + "angelegt; das Formular steht in der „Volle Liste“." },
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
      { art: "absatz", text:
        "**Auswertung › Dashboard**. In der Werkzeugleiste oben wird zuerst die "
        + "Ebene gewählt — **Mein Arbeitsplatz** oder, mit der entsprechenden "
        + "Berechtigung, **Unternehmen** —, daneben ein Schnellzeitraum oder ein "
        + "freier Zeitraum von–bis." },
      { art: "absatz", text:
        "Darunter folgen die Abschnitte Operative Steuerung; Akquise, Funnel & "
        + "Abschluss; Verkäufer-Leads nach Quelle; Kampagnen nach Gebiet; "
        + "Partnerempfehlungen; Empfehlungen und die Verteilung nach "
        + "Geschäftsstatus." },
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
    pfade: ["/crm/users", "/crm/training", "/crm/history", "/crm/archive", "/crm/hilfe"],
    bloecke: [
      { art: "absatz", text:
        "Der Bereich **Verwaltung** steht in der Modulleiste unten abgesetzt, weil "
        + "er selten gebraucht wird. Er enthält Anleitung, Geldwäsche & "
        + "Aufbewahrung (Kapitel 14), Benutzer & Rollen, Weiterbildung, Archiv und "
        + "Systemhistorie. Unter **Anwaltsprüfung** stehen gesammelt alle Fragen, "
        + "die vor der produktiven Nutzung anwaltlich zu klären sind — vorher standen "
        + "sie verteilt auf neun Arbeitsseiten." },
      { art: "absatz", text:
        "Unter **Benutzer & Rollen** werden Zugänge freigeschaltet, deaktiviert und "
        + "Rollen zugewiesen. Die Tabelle **Berechtigungen je Rolle** zeigt als "
        + "Matrix, welche Rolle was darf. Niemand kann sich selbst höhere Rechte "
        + "geben; die Administratorrolle vergibt nur ein Administrator. Jede Änderung "
        + "landet in der Systemhistorie." },
      { art: "absatz", text:
        "Unter **Weiterbildung** wird je Benutzer erfasst, welche Maßnahme wann mit "
        + "wie vielen Stunden belegt wurde („Nachweis erfassen“). Der Abschnitt "
        + "„Stand im laufenden Zeitraum“ zeigt je Benutzer einen Fortschrittsbalken: "
        + "erreichte Stunden gegen die Vorgabe, und wie viel noch offen ist. Stunden "
        + "dürfen mit Komma eingegeben werden." },
      { art: "absatz", text:
        "Die **Systemhistorie** protokolliert jede Änderung mit Zeitpunkt, Benutzer, "
        + "Bereich, Vorgangsnummer und den geänderten Feldern. Sie ist eine Tabelle; "
        + "ein Klick auf die Feldangabe einer Zeile klappt alter Wert → neuer Wert "
        + "auf. Gefiltert wird über die Werkzeugleiste nach Bereich, Aktion, Benutzer "
        + "und Referenz. Die Historie ist append-only: Einträge lassen sich nicht "
        + "ändern und nicht löschen." },
      { art: "absatz", text:
        "Im **Archiv** wird oben der Datentyp gewählt und zwischen **Aktiv** und "
        + "**Archiviert** umgeschaltet. Archivieren ist kein Löschen: der Vorgang "
        + "verschwindet aus den Arbeitslisten und bleibt nachvollziehbar; von hier "
        + "aus lässt er sich wiederherstellen." },
      { art: "warnung", text:
        "Die hinterlegten Soll-Stunden, Zeiträume und Aufbewahrungsfristen sind "
        + "betriebliche Voreinstellungen und keine rechtliche Aussage." },
    ],
  },
  {
    id: "aufmass",
    nummer: "24",
    titel: "Technisches Immobilienaufmaß",
    kurz: "Grundrisse und Wohnflächenberechnung als eigene Leistung — mit und ohne Maklerauftrag.",
    pfade: ["/measurements", "/measurements/new", "/measurements/:orderId"],
    bloecke: [
      { art: "absatz", text:
        "Das Aufmaß ist eine Dienstleistung neben der Vermittlung und deshalb ein "
        + "eigener Vorgang mit eigener Nummer (ZM-AM-…), unter **Immobilien › "
        + "Aufmaß-Aufträge**. Es kann zu einer Immobilie aus dem Bestand gehören — "
        + "muss es aber nicht: ein Auftrag für einen Eigentümer, der gar nicht "
        + "verkauft, trägt statt der Objektakte seine Anschrift selbst. Eines von "
        + "beidem, Immobilie oder Kunde, muss gesetzt sein." },
      { art: "absatz", text:
        "Anfragen über die öffentliche Seite /technisches-aufmass landen hier "
        + "unmittelbar als Auftrag im Stand „Angefragt“ — mit Paket, Objektart, "
        + "Ort und der ungefähren Fläche, die der Kunde angegeben hat. Das Formular "
        + "nimmt erst Anfragen entgegen, wenn unter „Verkaufsstrategie-Check“ ein "
        + "Empfänger für den Aufnahmeweg eingetragen ist." },
      { art: "schritte", punkte: [
        "**Angefragt** oder **Entwurf** — der Vorgang existiert, der Umfang steht noch nicht fest.",
        "**Angebot abgegeben** — der Preis ist genannt.",
        "**Beauftragt** — der Kunde hat zugesagt.",
        "**Termin vereinbart** — das Aufmaß vor Ort steht im Kalender.",
        "**Aufgemessen** — das Datum des Aufmaßes ist Pflicht für diesen Stand.",
        "**Geliefert** — Lieferdatum ist Pflicht. Beim Grundriss-Refresh geht es ohne den Umweg über „Aufgemessen“.",
        "**Abgerechnet** — Honorar und Rechnungsdatum sind Pflicht.",
        "**Bezahlt** — Zahlungsdatum ist Pflicht.",
      ]},
      { art: "absatz", text:
        "Das Honorar wird **brutto** eingetragen, also mit Umsatzsteuer — so, wie es "
        + "auch die Preise auf der öffentlichen Aufmaß-Seite nennen." },
      { art: "absatz", text:
        "Das Ergebnis besteht aus der Flächengrundlage (WoFlV, DIN 277 oder beides) "
        + "und den gemessenen Flächen. Eine Grundlage ohne Flächenangabe wird "
        + "abgewiesen — sie wäre eine Aussage über nichts." },
      { art: "hinweis", text:
        "Gehört der Auftrag zu einer Immobilie aus dem Bestand, trägt der Knopf "
        + "„Wohnfläche in die Objektakte übernehmen“ das Ergebnis dorthin: die "
        + "Wohnfläche an die Immobilie, die Grundlage nach „Recht & Lasten“. Das "
        + "passiert ausdrücklich und nicht automatisch, damit die Wohnfläche einer "
        + "Immobilie sich nicht nebenbei ändert, während jemand einen Auftrag abhakt. "
        + "Dafür wird zusätzlich die Berechtigung zum Bearbeiten von Immobilien benötigt." },
      { art: "absatz", text:
        "Unterlagen werden nicht ein zweites Mal gespeichert. Grundriss und "
        + "Wohnflächenberechnung liegen wie alle anderen Dateien in der "
        + "Dokumentenverwaltung der Immobilie — der Auftrag verweist nur darauf." },
      { art: "warnung", text:
        "Das System rechnet keine Wohnfläche aus und erzeugt keine Rechnung. Die "
        + "Flächen kommen aus der Berechnung, die als Unterlage beiliegt; das "
        + "Honorarfeld und die Rechnungsreferenz dokumentieren, was vereinbart und "
        + "wo abgerechnet wurde." },
    ],
  },
  {
    id: "grundsaetze",
    nummer: "25",
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
        "**Keine erfundenen Zahlen.** Wo nichts erfasst ist, steht ein Strich oder „nicht berechenbar“ — keine Null, die wie ein Wert aussieht.",
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
