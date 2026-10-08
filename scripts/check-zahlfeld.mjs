#!/usr/bin/env node
// Rechnet zahlFeld() an einer Fälletabelle nach.
//
// WIE DAS AUFKAM
//
// zahlFeld() in app/lib/public-intake.server.ts strich bis zum 08.10.2026
// jeden Punkt aus der Eingabe und machte dann das Komma zum Punkt. Fuer
// "1.250.000" ist das richtig. Fuer "87.5" wurde daraus 875 -- aus 87,5 m²
// eine Wohnung mit 875 m², lautlos, in allen vier oeffentlichen Formularen.
//
// Zahlenumwandlung ist die Art Code, die man beim Lesen fuer richtig haelt
// und nur mit Beispielen widerlegt. Deshalb steht sie hier als Tabelle und
// nicht als Behauptung im Kommentar.
//
// WIE GEPRUEFT WIRD
//
// Die Funktion wird aus der Quelle ausgeschnitten und ausgefuehrt. Kein
// Modul-Import, weil die Datei ".server.ts" ist und Worker-Abhaengigkeiten
// mitbringt, die in einem nackten node-Lauf nicht aufloesen.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const quelle = await readFile(path.join(WURZEL, "app/lib/public-intake.server.ts"), "utf8");

// textFeld und zahlFeld herausschneiden -- beide ohne Typangaben nachbauen.
const zahlFeldQuelle = quelle.match(/export function zahlFeld\(fd: FormData, key: string\) \{[\s\S]*?\n\}/);
if (!zahlFeldQuelle) {
  console.error("\nzahlFeld: Die Funktion liess sich in app/lib/public-intake.server.ts nicht finden.\n"
    + "  Entweder wurde sie umbenannt, oder ihre Signatur hat sich geaendert.\n"
    + "  Diese Pruefung liest dann ins Leere und muss angepasst werden.\n");
  process.exit(1);
}

const koerper = zahlFeldQuelle[0]
  .replace("export function zahlFeld(fd: FormData, key: string)", "function zahlFeld(fd, key)")
  // Die einzige Typangabe im Koerper. Steht spaeter eine weitere drin,
  // scheitert new Function() mit einem Syntaxfehler -- laut und sofort, nicht
  // still, und dann gehoert sie hier dazu.
  .replace("let normal: string;", "let normal;");

// eslint-disable-next-line no-new-func
const zahlFeld = new Function(`
  function textFeld(fd, key, max = 4000) {
    return String(fd.get(key) ?? "").trim().replace(/\\s+/g, " ").slice(0, max);
  }
  ${koerper}
  return zahlFeld;
`)();

const feld = (wert) => ({ get: () => wert });

/** [Eingabe, erwartetes Ergebnis] -- null heisst "keine brauchbare Zahl". */
const FAELLE = [
  // Der Fehler, der das hier ausgeloest hat
  ["87.5", 87.5],
  ["87,5", 87.5],

  // Tausendertrenner
  ["1.250", 1250],
  ["1.250.000", 1250000],
  ["1.250,50", 1250.5],
  ["1250000", 1250000],

  // Dezimalpunkt
  ["0.5", 0.5],
  ["3.25", 3.25],
  ["3,25", 3.25],
  ["120.75", 120.75],

  // Leerzeichen, wie sie beim Tippen entstehen
  [" 87,5 ", 87.5],
  ["1 250", 1250],

  // Nichts, Unsinn, Grenzen
  ["", null],
  ["   ", null],
  ["abc", null],
  ["0", null],
  ["-5", null],
  ["-5,5", null],
  ["1e5", null],
  ["10000000000", null],
  ["99999999999999", null],

  // Rundung auf zwei Stellen, wie die Spalte sie fuehrt
  ["12,345", 12.35],
  ["12,344", 12.34],
];

const fehler = [];
for (const [eingabe, erwartet] of FAELLE) {
  const ergebnis = zahlFeld(feld(eingabe), "x");
  if (ergebnis !== erwartet) {
    fehler.push(`zahlFeld("${eingabe}") ergibt ${JSON.stringify(ergebnis)}, erwartet war ${JSON.stringify(erwartet)}.`);
  }
}

if (fehler.length > 0) {
  console.error(`\nzahlFeld: ${fehler.length} von ${FAELLE.length} Fällen falsch.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`zahlFeld: ${FAELLE.length} Fälle richtig -- Dezimalpunkt, Dezimalkomma, `
  + `Tausendertrenner, Obergrenze und Rundung.`);
