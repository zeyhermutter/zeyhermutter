// Prueft, dass Anzeigeformate aus app/lib/format.ts kommen.
//
// Warum es diese Pruefung gibt
// ----------------------------
// Vor dem Zusammenlegen hatte fast jede Route ihre eigene money()- und
// formatDate()-Fassung: 121 Kopien in 69 Varianten. Das war nicht nur
// Wiederholung. 18 der 27 money()-Fassungen gaben fuer null, undefined und
// leeren Text "0 €" aus, weil Number(null) in JavaScript 0 ist und
// Number.isFinite(0) wahr. Auf dem Bildschirm stand dann ein Betrag, den
// niemand erfasst hatte — genau das, was der Master-Prompt verbietet:
// "keine KPI-Karten mit Beispielzahlen", keine erfundenen Zahlen.
//
// Eine Kopie zurueckzubauen kostet zwei Minuten, sie zu finden Wochen. Deshalb
// laeuft diese Pruefung bei jedem Build mit.
//
// Was geprueft wird
// -----------------
// 1. Kein eigenes Intl.NumberFormat mit Waehrung und kein eigenes
//    Intl.DateTimeFormat ausserhalb von app/lib/format.ts. Wer einen Betrag
//    oder ein Datum anzeigt, nimmt die gemeinsame Fassung.
// 2. Kein "?? 0" und kein "|| 0" als Argument einer Formatierungsfunktion.
//    Das ist die erfundene Null in ihrer direktesten Form.
//
// Eine begruendete Ausnahme wird unten eingetragen, mit Datei, Name und Grund.
// Sie steht damit im Repository und nicht im Kopf eines Einzelnen.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

const QUELLE = "app/lib/format.ts";

// Begruendete Ausnahmen: Datei → Liste von Funktionsnamen, die ein eigenes
// Intl-Format brauchen duerfen.
const AUSNAHMEN = {
  "app/lib/format.ts": ["*"],
  // Rechnet zwischen der Ortszeit eines datetime-local-Feldes und UTC um. Das
  // Intl-Format dient dort der Zonenverschiebung, nicht der Anzeige.
  "app/lib/local-time.ts": ["*"],
  "app/routes/calendar.tsx": [
    // Kalenderkopf und Spaltenkoepfe brauchen Formate, die sonst nirgends
    // vorkommen: "Mo, 07.09." ueber der Spalte und "September 2026" ueber dem
    // Monat. Eine eigene Funktion dafuer in format.ts haette genau einen
    // Aufrufer und wuerde die gemeinsame Fassung nur aufblaehen.
    "berlinParts",
    "formatDay",
    "monthLabel",
  ],
};

const FORMATFUNKTIONEN = [
  "euroRund", "euroGenau", "zahl", "flaeche", "prozent",
  "tag", "tagKurz", "zeitpunkt", "zeitpunktKurz", "uhrzeit",
];

function dateien(ordner, gesammelt = []) {
  for (const eintrag of readdirSync(ordner)) {
    const pfad = join(ordner, eintrag);
    if (statSync(pfad).isDirectory()) dateien(pfad, gesammelt);
    else if (/\.(ts|tsx)$/.test(eintrag)) gesammelt.push(pfad.split(sep).join("/"));
  }
  return gesammelt;
}

// Sucht die Funktion, in deren Rumpf eine Position liegt. Nur fuer die
// Fehlermeldung und die Ausnahmeliste.
function funktionUm(quelle, position) {
  const treffer = [...quelle.slice(0, position).matchAll(/function\s+([A-Za-z0-9_$]+)\s*\(/g)];
  return treffer.length ? treffer[treffer.length - 1][1] : "(oberste Ebene)";
}

function zeileVon(quelle, position) {
  return quelle.slice(0, position).split("\n").length;
}

const befunde = [];

for (const datei of dateien("app")) {
  const quelle = readFileSync(datei, "utf8");
  const erlaubt = AUSNAHMEN[datei] ?? [];
  if (erlaubt.includes("*")) continue;

  // Regel 1: eigene Intl-Formate
  for (const m of quelle.matchAll(/new\s+Intl\.(NumberFormat|DateTimeFormat)\s*\(/g)) {
    const funktion = funktionUm(quelle, m.index);
    if (erlaubt.includes(funktion)) continue;
    // Reine Zahlen ohne Waehrung sind erlaubt, solange sie nicht als Geld
    // auftreten; Geld erkennt man an style:"currency".
    const umfeld = quelle.slice(m.index, m.index + 400);
    const istGeld = /style:\s*"currency"/.test(umfeld);
    if (m[1] === "NumberFormat" && !istGeld) continue;
    befunde.push({
      datei,
      zeile: zeileVon(quelle, m.index),
      regel: "eigenes Anzeigeformat",
      text: `${m[1]} in ${funktion}() — stattdessen ${m[1] === "DateTimeFormat" ? "tag/zeitpunkt" : "euroRund/euroGenau"} aus ~/lib/format verwenden`,
    });
  }

  // Regel 2: erfundene Null als Argument einer Formatierungsfunktion
  const namen = FORMATFUNKTIONEN.join("|");
  for (const m of quelle.matchAll(new RegExp(`\\b(${namen})\\s*\\([^()]*(\\?\\?|\\|\\|)\\s*0\\b`, "g"))) {
    befunde.push({
      datei,
      zeile: zeileVon(quelle, m.index),
      regel: "erfundene Null",
      text: `${m[1]}(… ${m[2]} 0) — ohne erfassten Wert gehoert ein Strich in die Anzeige, keine Null`,
    });
  }
}

if (befunde.length) {
  console.error(`\nAnzeigeformate: ${befunde.length} Befund${befunde.length === 1 ? "" : "e"}\n`);
  for (const b of befunde) console.error(`  ${b.datei}:${b.zeile}  [${b.regel}]\n    ${b.text}`);
  console.error(`\nDie gemeinsame Fassung steht in ${QUELLE}.`);
  console.error("Braucht eine Stelle wirklich ein eigenes Format, wird sie in scripts/check-anzeigeformate.mjs");
  console.error("unter AUSNAHMEN eingetragen — mit Begruendung.\n");
  process.exit(1);
}

console.log("Anzeigeformate: in Ordnung.");
