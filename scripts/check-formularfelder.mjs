#!/usr/bin/env node
// Bewacht, dass der Aktionsteil einer Route nur Felder liest, die ihr
// Formular auch sendet.
//
// WIE DAS AUFKAM
//
// In app/routes/measurement-detail.tsx stand am 08.10.2026:
//
//     if (next === "INVOICED" && !text(fd, "invoiced_on_known"))
//       update.invoiced_on = text(fd, "invoiced_on") || heute();
//
// Kein Formular hat je "invoiced_on_known" gesendet. Die Bedingung war damit
// immer wahr, und jeder Klick auf "Rechnung gestellt" setzte das
// Rechnungsdatum auf heute -- auch wenn im Honorarblock der 01.09. stand.
// Ein Schutzschalter, der nie angeschlossen war, und dahinter stiller
// Datenverlust.
//
// Das ist eine Fehlerklasse, nicht ein Einzelfall: `text(fd, "x")` gibt fuer
// ein fehlendes Feld denselben leeren Text wie fuer ein leer gelassenes. Der
// Unterschied zwischen "der Benutzer hat nichts eingetragen" und "dieses
// Feld existiert nicht" ist im Code nicht sichtbar. Der Uebersetzer sieht ihn
// nicht, die Typen sehen ihn nicht, beim Lesen sieht man ihn auch nicht.
//
// WAS GEPRUEFT WIRD
//
// Fuer jede Route: jeder Feldname, den der Aktionsteil liest, kommt im
// Markup derselben Datei als name="..." vor -- oder in einer Komponente, die
// die Datei einbindet, oder in der Liste AUSNAHMEN mit Begruendung.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFile(path.join(WURZEL, p), "utf8").then((t) => t.replace(/\r\n/g, "\n"));

/**
 * Kommentare durch gleich lange Leerzeichen ersetzen, damit Zeilennummern
 * stimmen bleiben.
 *
 * Ohne das meldet die Pruefung sich selbst: der Kommentar, der einen
 * behobenen Fehler beschreibt, zitiert den alten Aufruf im Wortlaut -- und
 * genau danach sucht sie. Eine Pruefung, die auf die Beschreibung eines
 * Fehlers anschlaegt statt auf den Fehler, ist Laerm.
 */
function ohneKommentare(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (treffer) => treffer.replace(/[^\n]/g, " "))
    .replace(/(^|[^:"'`\\])\/\/[^\n]*/g, (treffer, vor) => vor + " ".repeat(treffer.length - vor.length));
}

/**
 * Felder, die absichtlich nicht im Markup stehen -- jeweils mit dem Grund,
 * woher sie sonst kommen.
 */
const AUSNAHMEN = {
  // Von der Edge-Funktion oder einem fremden Absender geschickt, nicht aus
  // einem Formular dieser Anwendung.
  "app/routes/api-sales-readiness-ai.ts": "*",
  // Die KI-Leiste baut ihre Felder im Browser aus dem Zustand der Seite.
  "app/components/sales-readiness-ai-panel.tsx": "*",
};

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

// Alle Feldnamen, die irgendwo im Haus in einem Markup stehen. Komponenten
// werden quer eingebunden -- MentionPicker, TaskModal, der
// Verkaufsfertig-Arbeitsbereich --, und der Aktionsteil einer Route liest
// deren Felder. Die Pruefung fragt deshalb hausweit, nicht je Datei: sie
// findet Namen, die es NIRGENDS gibt, und das ist der Fehler, um den es geht.
const imMarkup = new Set();
for (const datei of dateien) {
  const inhalt = await lies(datei);
  for (const t of inhalt.matchAll(/\bname="([a-z_][a-z0-9_]*)"/g)) imMarkup.add(t[1]);
  // name={`praefix_${...}`} -- der feste Anfang zaehlt mit.
  for (const t of inhalt.matchAll(/\bname=\{`([a-z_][a-z0-9_]*)/g)) imMarkup.add(t[1]);
  // Felder, die im Browser per FormData/append gesetzt werden.
  for (const t of inhalt.matchAll(/\.(?:append|set)\(\s*"([a-z_][a-z0-9_]*)"/g)) imMarkup.add(t[1]);
}

let gelesen = 0;
for (const datei of dateien) {
  if (AUSNAHMEN[datei] === "*") continue;
  const inhalt = ohneKommentare(await lies(datei));
  // Nur Dateien mit Aktionsteil -- sonst gibt es kein fd.
  if (!/\bfd\b|formData/.test(inhalt)) continue;
  const zeile = (stelle) => inhalt.slice(0, stelle).split("\n").length;

  for (const t of inhalt.matchAll(/(?:text|zahl|dezimal|ganzzahl|textFeld|zahlFeld|nullable|dateOrNull|numberValue)\(\s*(?:fd|formData)\s*,\s*"([a-z_][a-z0-9_]*)"/g)) {
    const feld = t[1];
    gelesen += 1;
    if (imMarkup.has(feld)) continue;
    fehler.push(
      `${datei}:${zeile(t.index)} liest das Formularfeld "${feld}", das in keinem\n`
      + "  Markup des Hauses als name=\"...\" vorkommt. Kein Formular sendet es.\n"
      + "  Der Lesevorgang gibt deshalb immer leeren Text -- ununterscheidbar\n"
      + "  von einem Feld, das der Benutzer leer gelassen hat. Steht der Wert\n"
      + "  in einer Bedingung, ist der Zweig damit fest verdrahtet.\n"
      + "  Entweder fehlt das Feld im Formular, oder die Leseanweisung ist ein\n"
      + "  Rest aus einer frueheren Fassung und gehoert weg.",
    );
  }
  for (const t of inhalt.matchAll(/\b(?:fd|formData)\.get\(\s*"([a-z_][a-z0-9_]*)"/g)) {
    const feld = t[1];
    gelesen += 1;
    if (imMarkup.has(feld)) continue;
    fehler.push(
      `${datei}:${zeile(t.index)} liest das Formularfeld "${feld}" mit .get(), das in\n`
      + "  keinem Markup des Hauses als name=\"...\" vorkommt. Siehe oben.",
    );
  }
}

if (fehler.length > 0) {
  console.error(`\nFormularfelder: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Formularfelder: ${gelesen} Lesevorgaenge geprueft, ${imMarkup.size} Feldnamen im Markup, `
  + `${Object.keys(AUSNAHMEN).length} begruendete Ausnahmen -- kein Zugriff auf ein Feld, das niemand sendet.`);
