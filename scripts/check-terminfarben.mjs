#!/usr/bin/env node
// Bewacht die Terminkategorien des Kalenders.
//
// WAS HIER SCHIEFGEHEN KANN
//
// Der Kalender zieht Termine aus fuenf Quellen zusammen. Jede Kategorie
// braucht vier Dinge, die an vier verschiedenen Stellen stehen:
//
//   app/lib/terminkategorien.ts   Beschriftung, Kuerzel, Klassenname
//   app/calendar.css              Flaechenfarbe und Schriftfarbe
//   app/routes/calendar.tsx       der Ladeteil, der die Kategorie setzt
//   app/routes/calendar-event.ts  die Kategorien, die .ics ausgeben darf
//
// Eine sechste Kategorie legt man im Ladeteil an -- dort fallen die drei
// uebrigen Stellen nicht auf. Das Ergebnis ist eine Marke ohne Farbe im
// Monatsraster und eine Kategorie, die in der Legende fehlt. Auf einem
// Bildschirm mit zwanzig Terminen sieht das aus wie ein Darstellungsfehler
// und nicht wie eine fehlende Zeile.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// 1. Der Typ Terminkategorie und die Liste TERMINKATEGORIEN nennen dieselben
//    Kategorien -- keine mehr, keine weniger.
// 2. Die Kuerzel sind paarweise verschieden. Zwei Kategorien mit demselben
//    Buchstaben sind fuer jemanden, der die Farben nicht unterscheidet,
//    dieselbe Kategorie.
// 3. Zu jeder Kategorieklasse gibt es in app/calendar.css eine Regel, die
//    Flaechenfarbe UND Schriftfarbe setzt.
// 4. Der Kontrast dieser beiden Farben erreicht 4,5:1. Die Marke ist 16px
//    gross und traegt 10px-Schrift -- Kleinschrift, also der strenge Wert.
// 5. Jede Kategorie, die der Ladeteil setzt, ist beschrieben.
// 6. Der .ics-Ausgang kennt genau diese Kategorien, kleingeschrieben.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFile(path.join(WURZEL, p), "utf8").then((t) => t.replace(/\r\n/g, "\n"));

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const quelle = await lies("app/lib/terminkategorien.ts");
const stil = await lies("app/calendar.css");
const seite = await lies("app/routes/calendar.tsx");
const ausgang = await lies("app/routes/calendar-event.ts");

// --- Die Liste und der Typ ------------------------------------------------

const typZeile = /export type Terminkategorie =([^;]+);/.exec(quelle);
pruefe(typZeile, "app/lib/terminkategorien.ts hat keinen Typ Terminkategorie mehr.");
const imTyp = [...(typZeile?.[1] ?? "").matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);

const beschrieben = [...quelle.matchAll(
  /\{\s*schluessel:\s*"([A-Z_]+)",\s*beschriftung:\s*"([^"]+)",\s*kuerzel:\s*"([^"]+)",\s*klasse:\s*"([a-z-]+)"\s*\}/g,
)].map((m) => ({ schluessel: m[1], beschriftung: m[2], kuerzel: m[3], klasse: m[4] }));

pruefe(beschrieben.length > 0, "In app/lib/terminkategorien.ts ist keine Kategorie mehr beschrieben.\n"
  + "  Entweder ist die Liste leer, oder ihre Form hat sich geaendert und diese\n"
  + "  Pruefung liest sie nicht mehr. Beides ist ein Befund.");

const inListe = beschrieben.map((k) => k.schluessel);
for (const schluessel of imTyp) {
  pruefe(inListe.includes(schluessel),
    `Die Kategorie ${schluessel} steht im Typ Terminkategorie, aber nicht in TERMINKATEGORIEN.\n`
    + "  Damit hat sie keine Farbe, kein Kuerzel und keine Zeile in der Legende.");
}
for (const schluessel of inListe) {
  pruefe(imTyp.includes(schluessel),
    `TERMINKATEGORIEN nennt ${schluessel}, der Typ Terminkategorie kennt den Wert nicht.`);
}

// --- Die Kuerzel sind verschieden -----------------------------------------

for (const kategorie of beschrieben) {
  const gleiche = beschrieben.filter((k) => k.kuerzel === kategorie.kuerzel);
  // Nur beim ersten der Gleichen melden -- sonst steht derselbe Befund zweimal da.
  pruefe(gleiche.length === 1 || gleiche[0] !== kategorie,
    `Das Kuerzel "${kategorie.kuerzel}" tragen ${gleiche.length} Kategorien: ${gleiche.map((k) => k.schluessel).join(", ")}.\n`
    + "  Das Kuerzel ist die Unterscheidung fuer jemanden, der die Farben nicht\n"
    + "  unterscheidet. Zweimal derselbe Buchstabe hebt sie auf.");
  pruefe(/^[A-ZÄÖÜ]$/.test(kategorie.kuerzel),
    `Das Kuerzel "${kategorie.kuerzel}" von ${kategorie.schluessel} ist nicht ein einzelner Grossbuchstabe.\n`
    + "  Die Marke ist 16 Pixel breit; mehr als ein Zeichen passt nicht hinein.");
}

// --- Farbe und Kontrast ---------------------------------------------------

const linear = (wert) => {
  const anteil = wert / 255;
  return anteil <= 0.04045 ? anteil / 12.92 : ((anteil + 0.055) / 1.055) ** 2.4;
};

function helligkeit(farbe) {
  const voll = farbe.length === 4
    ? `#${farbe[1]}${farbe[1]}${farbe[2]}${farbe[2]}${farbe[3]}${farbe[3]}`
    : farbe;
  const zahl = Number.parseInt(voll.slice(1), 16);
  return 0.2126 * linear((zahl >> 16) & 255) + 0.7152 * linear((zahl >> 8) & 255) + 0.0722 * linear(zahl & 255);
}

function kontrast(a, b) {
  const [hell, dunkel] = [helligkeit(a), helligkeit(b)].sort((x, y) => y - x);
  return (hell + 0.05) / (dunkel + 0.05);
}

const KLEINSCHRIFT = 4.5;

for (const kategorie of beschrieben) {
  const regel = new RegExp(`\\.${kategorie.klasse}\\s*\\{([^}]*)\\}`).exec(stil);
  if (!regel) {
    fehler.push(`app/calendar.css hat keine Regel .${kategorie.klasse} fuer ${kategorie.schluessel}.\n`
      + "  Ohne sie ist die Marke im Monatsraster weiss auf weiss.");
    continue;
  }
  const flaeche = /background\s*:\s*(#[0-9a-f]{3,8})/i.exec(regel[1]);
  const schrift = /(?<!-)color\s*:\s*(#[0-9a-f]{3,8})/i.exec(regel[1]);
  pruefe(flaeche, `.${kategorie.klasse} setzt keine Flaechenfarbe als Hexwert.`);
  pruefe(schrift, `.${kategorie.klasse} setzt keine Schriftfarbe als Hexwert.`);
  if (!flaeche || !schrift) continue;

  const wert = kontrast(schrift[1], flaeche[1]);
  pruefe(wert >= KLEINSCHRIFT,
    `.${kategorie.klasse} (${kategorie.beschriftung}): ${schrift[1]} auf ${flaeche[1]} ergibt `
    + `${wert.toFixed(2)}:1, gefordert sind ${KLEINSCHRIFT}:1.\n`
    + "  Das Kuerzel in der Marke ist 10 Pixel gross -- Kleinschrift. Entweder die\n"
    + "  Schrift dunkler oder die Flaeche heller.");
}

// --- Der Ladeteil setzt nur beschriebene Kategorien -----------------------

const gesetzt = new Set([...seite.matchAll(/\bkind:\s*"([A-Z_]+)"/g)].map((m) => m[1]));
for (const schluessel of gesetzt) {
  pruefe(inListe.includes(schluessel),
    `app/routes/calendar.tsx legt Termine mit kind: "${schluessel}" an, `
    + "TERMINKATEGORIEN beschreibt den Wert nicht.\n"
    + "  Im Monatsraster faellt die Marke dieser Termine aus.");
}
for (const schluessel of inListe) {
  pruefe(gesetzt.has(schluessel),
    `TERMINKATEGORIEN beschreibt ${schluessel}, aber app/routes/calendar.tsx legt keinen\n`
    + "  Termin dieser Kategorie an. Entweder fehlt die Quelle, oder die Zeile in der\n"
    + "  Legende steht fuer etwas, das es nicht gibt.");
}

// --- Der .ics-Ausgang kennt dieselben Kategorien --------------------------

const imAusgang = new Set([...(/const KINDS = new Set\(\[([^\]]*)\]\)/.exec(ausgang)?.[1] ?? "")
  .matchAll(/"([a-z_]+)"/g)].map((m) => m[1]));
for (const schluessel of inListe) {
  pruefe(imAusgang.has(schluessel.toLowerCase()),
    `app/routes/calendar-event.ts gibt fuer ${schluessel} keine Kalenderdatei aus `
    + `("${schluessel.toLowerCase()}" fehlt in KINDS).\n`
    + "  Der .ics-Knopf steht an jedem Termin; bei dieser Kategorie liefe er ins Leere.");
}
for (const schluessel of imAusgang) {
  pruefe(inListe.some((k) => k.toLowerCase() === schluessel),
    `KINDS in app/routes/calendar-event.ts nennt "${schluessel}", `
    + "TERMINKATEGORIEN kennt die Kategorie nicht.");
}

// --- Ergebnis -------------------------------------------------------------

if (fehler.length > 0) {
  console.error(`\nTerminfarben: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Terminfarben: ${beschrieben.length} Kategorien mit eigenem Kuerzel (`
  + `${beschrieben.map((k) => k.kuerzel).join(" ")}), Farbe in app/calendar.css, `
  + "Kontrast >= 4.5:1, Ladeteil und .ics-Ausgang vollstaendig.");
