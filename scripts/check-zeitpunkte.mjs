#!/usr/bin/env node
// Bewacht, dass kein Zeitpunkt von Hand zusammengesetzt wird.
//
// WIE DAS AUFKAM
//
// Am 08.10.2026 stand in app/routes/lead-sales-readiness.tsx:
//
//     function inspectionIso(value) { return value ? `${value}T12:00:00.000Z` : null; }
//
// Das Eingabefeld war ein Datum, die Spalte ein timestamptz. 12:00 UTC ist in
// Berlin 14:00 im Sommer und 13:00 im Winter. Jede Begehung stand also zu
// einer Uhrzeit, die niemand eingegeben hat -- und der .ics-Export schrieb
// DTSTART:...T120000Z. Wer den Termin in Outlook uebernahm, kam drei Stunden
// zu spaet.
//
// Gemessen wurde danach die ganze Klasse, nicht der Einzelfall: dieselbe
// Zeichenkette stand noch fuenf Mal im Haus -- zweimal fuer tasks.due_at,
// einmal in contact-relations.tsx, einmal fuer planned_go_live_at. Also an
// genau der Spalte, die der Kalender als Kategorie A liest.
//
// Dabei besitzt app/lib/local-time.ts die richtige Umrechnung schon:
// crmLocalDateTimeToIso fuer ein datetime-local-Feld, crmDateAtTimeToIso fuer
// ein Datumsfeld plus Uhrzeit. Beide rechnen die Zonenverschiebung zweimal
// nach und sind damit auch in den Umstellungsnaechten richtig.
//
// WAS GEPRUEFT WIRD
//
// Keine Datei unter app/ setzt einen ISO-Zeitpunkt aus einer Zeichenkette
// zusammen -- ausser den unten namentlich genannten Stellen, die damit nichts
// speichern, sondern nur rechnen oder anzeigen.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFile(path.join(WURZEL, p), "utf8").then((t) => t.replace(/\r\n/g, "\n"));

/**
 * Stellen, die einen Mittagszeitpunkt bauen, um ein Datum anzuzeigen oder
 * Tage zu zaehlen. Sie schreiben nichts in die Datenbank; der Mittag
 * vermeidet dort nur den Fehler um einen Tag an den Zonengrenzen.
 */
const ERLAUBT = {
  "app/lib/format.ts": "Zeigt ein Datum an. Der Mittag verhindert, dass der 01.10. in einer westlichen Zone als 30.09. erscheint.",
  "app/routes/calendar.tsx": "formatDay() beschriftet einen Tag des Monatsrasters. Reine Anzeige.",
  "app/routes/property-pricing.tsx": "dayDiff() zaehlt Tage zwischen zwei Daten. Beide Seiten tragen denselben Mittag, die Differenz ist davon unabhaengig.",
  "app/routes/pipeline.tsx": "gruppe() rechnet sieben Tage auf ein Datum und schneidet wieder auf ein Datum zurueck. In UTC gerechnet, damit kein Sommerzeitsprung einen Tag verschiebt; es wird nichts gespeichert und keine Uhrzeit gezeigt.",
  "app/routes/reports.tsx": "validDate() prueft nur, ob ein Datum ueberhaupt parsbar ist, und daysBetween() zieht zwei Daten mit derselben Verschiebung voneinander ab. Beides reine Rechnung ohne Uhrzeit.",
};

// `${irgendwas}T12:00:00Z` und Verwandte -- ein Zeitpunkt aus einer
// Zeichenkette, mit fester Uhrzeit und fester oder fehlender Zone.
const HANDGEMACHT = /`\$\{[^`]*\}T\d{2}:\d{2}(:\d{2})?(\.\d{3})?Z?`/g;

const fehler = [];

async function alleDateien(verzeichnis) {
  const eintraege = await readdir(path.join(WURZEL, verzeichnis), { withFileTypes: true });
  const gefunden = [];
  for (const eintrag of eintraege) {
    const weg = `${verzeichnis}/${eintrag.name}`;
    if (eintrag.isDirectory()) gefunden.push(...await alleDateien(weg));
    else if (/\.(ts|tsx)$/.test(eintrag.name)) gefunden.push(weg);
  }
  return gefunden;
}

const dateien = await alleDateien("app");
let geprueft = 0;

for (const datei of dateien) {
  const inhalt = await lies(datei);
  const treffer = [...inhalt.matchAll(HANDGEMACHT)];
  if (treffer.length === 0) continue;
  geprueft += treffer.length;
  if (ERLAUBT[datei]) continue;
  const zeile = (stelle) => inhalt.slice(0, stelle).split("\n").length;
  for (const t of treffer) {
    fehler.push(
      `${datei}:${zeile(t.index)} setzt einen Zeitpunkt von Hand zusammen: ${t[0]}\n`
      + "  Ein Datumsfeld, das in eine timestamptz-Spalte schreibt, geht durch\n"
      + "  crmDateAtTimeToIso() aus app/lib/local-time.ts; ein datetime-local-Feld\n"
      + "  durch crmLocalDateTimeToIso(). Beide lesen die Eingabe als Ortszeit und\n"
      + "  halten die Sommerzeit aus. Eine angehaengte Zeichenkette tut das nicht:\n"
      + "  T12:00:00Z ist in Berlin 14:00 -- eine Uhrzeit, die niemand eingegeben hat.\n"
      + "  Wird hier nur gerechnet oder angezeigt, gehoert die Datei mit Begruendung\n"
      + "  in die Liste ERLAUBT dieser Pruefung.",
    );
  }
}

// Die Erlaubnisliste darf nicht veralten: eine Datei, die dort steht und das
// Muster nicht mehr enthaelt, verdeckt beim naechsten Mal eine neue Stelle.
for (const [datei, grund] of Object.entries(ERLAUBT)) {
  const inhalt = await lies(datei);
  if (!HANDGEMACHT.test(inhalt)) {
    fehler.push(`${datei} steht in der Erlaubnisliste, enthaelt das Muster aber nicht mehr.\n  Bitte den Eintrag entfernen.`);
  }
  if (grund.length < 40) fehler.push(`Die Erlaubnis fuer ${datei} hat keine brauchbare Begruendung.`);
  HANDGEMACHT.lastIndex = 0;
}

if (fehler.length > 0) {
  console.error(`\nZeitpunkte: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Zeitpunkte: ${dateien.length} Dateien geprueft, ${geprueft} Mittagszeitpunkte `
  + `in ${Object.keys(ERLAUBT).length} begruendeten Anzeigestellen, keine handgemachte Speicherung.`);
