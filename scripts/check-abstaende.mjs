#!/usr/bin/env node
// Bewacht die Abstaende aller Flaechen im CRM.
//
// WAS HIER SCHIEFGING -- ZWEIMAL
//
// Erst die Sache selbst. Gemessen ueber alle Stylesheets in app/:
//
//   padding         181 verschiedene Werte in 417 Deklarationen,  1 ueber ein Merkmal
//   gap              43 verschiedene Werte in 372 Deklarationen,  7 ueber ein Merkmal
//   border-radius    25 verschiedene Werte in 225 Deklarationen,  0 ueber ein Merkmal
//
// .data-card hatte drei konkurrierende Werte, je nachdem welche Regel zuletzt
// gewann. Einzeln faellt keiner dieser Werte auf -- sie sind alle ungefaehr
// richtig. Zusammen sieht es unaufgeraeumt aus.
//
// Dann der Fehler in der ersten Fassung DIESER PRUEFUNG. Sie suchte nach
// NAMEN: card, pill, badge, chip, status. Damit hat sie 94 Stellen gefunden
// und gemeldet, alles sei in Ordnung -- waehrend 111 weitere Flaechen
// unberuehrt blieben, weil sie anders heissen:
//
//   .calendar-kind, .communication-direction    Pillen, nur anders benannt
//   .history-event, .calendar-event             Flaechen in einer Karte
//   .form-field input, .inline-upload input     Eingabefelder
//   .task-create-modal                          Fenster
//
// Allein die Flaechen in Karten: 70 Stellen mit 42 verschiedenen Wertepaaren.
//
// Eine Pruefung, die nach Namen sucht, prueft die Benennungsdisziplin und
// nicht die Sache. Sie schaut jetzt auf die FORM: was einen Rahmen oder
// Hintergrund hat, dazu eine Rundung und einen Innenabstand, ist eine
// Flaeche -- unabhaengig davon, wie es heisst.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// Jede Flaeche in den internen Stylesheets nimmt Innenabstand und Rundung aus
// den Merkmalen ihrer Familie:
//
//   Karte gross   gliedert eine Seite
//   Karte klein   Kachel in einem Raster, Flaeche in einer Karte
//   Pille         Rundung 999px
//   Eingabefeld   input, select, textarea
//   Fenster       modal, dialog, popover
//
// Die Familie haengt am LETZTEN Teil des Selektors, nicht am Vorfahren:
// ".lead-task-modal-meta span" ist ein kleiner Kasten IM Fenster und bekam
// beim ersten Umbau dessen 24px statt seiner 10px.
//
// NICHT GEPRUEFT, mit Absicht:
//
//   - die oeffentliche Webseite und die Entwurfsgalerie: eigenes Raster mit
//     clamp()-Abstaenden ueber mehrere Bildschirmbreiten.
//   - Navigationsleisten, Reiter und Listenzeilen: feste Zeilenhoehe, oft
//     Innenabstand nur seitlich ("0 14px"). Eine andere Form.
//   - Knoepfe: eine eigene Familie, noch nicht an der Reihe.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STIL = path.join(WURZEL, "app");

const NICHT_INTERN = new Set([
  "public-website.css", "homepage-variants.css", "homepage-variants-image.css",
  "homepage-v7-realtor.css", "auth-light-theme.css",
]);

/** Navigation, Reiter, Listenzeilen, Knoepfe: eine andere Form. */
const ANDERE_FORM = /(nav-item|objektakte-|persistent-nav|record-section-nav|-tab\b|tab-|button|lead-stage|data-row|backdrop|\bsummary\b)/i;
/** Innenabstand nur seitlich -- eine Zeile fester Hoehe, kein Kasten. */
const NUR_SEITLICH = /^0(px)? \S+$/;
/** Berechnete Werte gehoeren ihrer Stelle, nicht einer Familie. */
const BERECHNET = /calc|clamp|var\(/;

const FAMILIEN = {
  feld: { padding: "--crm-field-padding", radius: "--crm-field-radius" },
  fenster: { padding: "--crm-modal-padding", radius: "--crm-modal-radius" },
  pille: { padding: "--crm-pill-padding-sm", radius: "--crm-pill-radius" },
  klein: { padding: "--crm-card-padding-sm", radius: "--crm-card-radius-sm" },
};

const MERKMALE = [
  "--crm-card-padding", "--crm-card-padding-sm", "--crm-card-radius", "--crm-card-radius-sm",
  "--crm-pill-padding", "--crm-pill-padding-sm", "--crm-pill-radius",
  "--crm-pill-font", "--crm-pill-font-sm",
  "--crm-field-padding", "--crm-field-radius", "--crm-modal-padding", "--crm-modal-radius",
];

/** Selektor -> Begruendung. Nur, was wirklich anders sein soll. */
const AUSNAHMEN = {
  ".asset-modal": "Bildfenster, randlos bis an die Kante -- eigene Rundung.",
  ".asset-modal-header": "Kopfzeile im Fenster, buendig mit dessen Rand.",
  ".asset-modal-close": "Schliessknopf, folgt den Knoepfen und nicht den Flaechen.",
  ".media-disclosure.owner-card": "Aufklapper ohne eigene Flaeche -- bewusst ohne Rundung.",
};

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const dateien = (await readdir(STIL)).filter((n) => n.endsWith(".css")).sort();
const inhalte = new Map();
for (const datei of dateien) {
  inhalte.set(datei, (await readFile(path.join(STIL, datei), "utf8")).replace(/\r\n/g, "\n"));
}

// --- 1. Jedes Merkmal genau einmal ---------------------------------------

for (const merkmal of MERKMALE) {
  const stellen = [];
  for (const datei of dateien) {
    for (const _ of inhalte.get(datei).match(new RegExp(`${merkmal}\\s*:`, "g")) ?? []) stellen.push(datei);
  }
  pruefe(stellen.length === 1,
    `${merkmal} ist ${stellen.length}-mal definiert${stellen.length ? ` (${[...new Set(stellen)].join(", ")})` : ""}.\n`
    + "  Genau eine Definition. Zwei Werte fuer dieselbe Zahl laufen auseinander, und\n"
    + "  welcher gewinnt, haengt an der Reihenfolge der Regeln oder der Stylesheets.");
}

// --- 2. Jede Flaeche nimmt die Merkmale ihrer Familie --------------------

const schluessel = (sel) => sel
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/@import[^;]*;/g, "")
  .replace(/\s*([>+~,])\s*/g, "$1").replace(/\s+/g, " ").trim();

function familie(sel, radius) {
  const letztes = sel.split(",")[0].split(/[\s>+~]+/).filter(Boolean).at(-1) ?? "";
  if (/\b(input|select|textarea)\b/.test(letztes)) return "feld";
  if (/modal|dialog|popover/i.test(letztes)) return "fenster";
  if (radius.trim() === "999px" || radius.includes("--crm-pill-radius")) return "pille";
  return "klein";
}

const befunde = [];
let flaechen = 0;

for (const datei of dateien) {
  if (NICHT_INTERN.has(datei)) continue;
  const text = inhalte.get(datei).replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));
  for (const regel of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (regel[1].trimStart().startsWith("@")) continue;
    const sel = schluessel(regel[1]);
    if (Object.hasOwn(AUSNAHMEN, sel) || ANDERE_FORM.test(sel)) continue;

    const block = regel[2];
    if (!/(?<!-)border\s*:|background\s*:/.test(block)) continue;
    const radius = /border-radius\s*:\s*([^;!}]+)/.exec(block);
    const padding = /(?<![-\w])padding\s*:\s*([^;!}]+)/.exec(block);
    if (!radius || !padding) continue;
    if (NUR_SEITLICH.test(padding[1].trim())) continue;
    if (BERECHNET.test(padding[1]) && !padding[1].includes("var(--crm-")) continue;

    flaechen += 1;
    const art = familie(sel, radius[1]);
    // Eine grosse Karte darf das grosse Merkmal nehmen -- das ist dieselbe Familie.
    const BEIDE_GROESSEN = {
      klein: ["--crm-card-padding-sm", "--crm-card-padding"],
      pille: ["--crm-pill-padding-sm", "--crm-pill-padding"],
    };
    const erlaubtPadding = BEIDE_GROESSEN[art] ?? [FAMILIEN[art].padding];
    const erlaubtRadius = art === "klein"
      ? ["--crm-card-radius-sm", "--crm-card-radius"]
      : [FAMILIEN[art].radius];

    if (!erlaubtPadding.some((m) => padding[1].includes(m))) {
      befunde.push({ datei, sel, art, eigenschaft: "padding", wert: padding[1].trim(), soll: FAMILIEN[art].padding });
    }
    if (!erlaubtRadius.some((m) => radius[1].includes(m))) {
      befunde.push({ datei, sel, art, eigenschaft: "border-radius", wert: radius[1].trim(), soll: FAMILIEN[art].radius });
    }
  }
}

pruefe(befunde.length === 0,
  `${befunde.length} Flaechen setzen Innenabstand oder Rundung als Zahl statt ueber ein Merkmal:\n`
  + befunde.slice(0, 20).map((b) => `    ${b.art.padEnd(8)} app/${b.datei}  ${b.sel}\n`
    + `             ${b.eigenschaft}: ${b.wert}   ->   var(${b.soll})`).join("\n")
  + (befunde.length > 20 ? `\n    ... und ${befunde.length - 20} weitere` : "") + "\n"
  + "  Zwei Flaechen nebeneinander, deren Inhalt unterschiedlich weit vom Rand steht,\n"
  + "  sehen unaufgeraeumt aus, ohne dass man sagen koennte welche falsch ist.\n"
  + "  Entweder das Merkmal der Familie benutzen, oder -- wenn die Flaeche wirklich\n"
  + "  anders sein soll -- in AUSNAHMEN in scripts/check-abstaende.mjs eintragen.");

// --- 3. Keine Leiche in der Ausnahmeliste --------------------------------

const alleSelektoren = new Set();
for (const datei of dateien) {
  const text = inhalte.get(datei).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const regel of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (regel[1].trimStart().startsWith("@")) continue;
    alleSelektoren.add(schluessel(regel[1]));
  }
}
for (const [sel, grund] of Object.entries(AUSNAHMEN)) {
  pruefe(grund.length >= 25, `Die Ausnahme "${sel}" hat keine brauchbare Begruendung.`);
  pruefe(alleSelektoren.has(sel), `AUSNAHMEN nennt "${sel}", aber kein Stylesheet hat diesen Selektor mehr.`);
}

if (fehler.length > 0) {
  console.error(`\nAbstaende: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Abstaende: ${MERKMALE.length} Merkmale je einmal definiert, ${flaechen} Flaechen nach Form geprueft `
  + `(Karte, Pille, Eingabefeld, Fenster), ${Object.keys(AUSNAHMEN).length} begruendete Ausnahmen.`);
