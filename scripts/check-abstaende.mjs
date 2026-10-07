#!/usr/bin/env node
// Bewacht die Abstaende der Kaesten und Pillen im CRM.
//
// WAS HIER SCHIEFGING
//
// Gemessen ueber alle Stylesheets in app/:
//
//   padding         181 verschiedene Werte in 417 Deklarationen,  1 ueber ein Merkmal
//   gap              43 verschiedene Werte in 372 Deklarationen,  7 ueber ein Merkmal
//   border-radius    25 verschiedene Werte in 225 Deklarationen,  0 ueber ein Merkmal
//
// Bei den Kaesten allein: 23 verschiedene Innenabstaende und 9 Eckenradien.
// .data-card hatte drei konkurrierende Werte (22px, var(--crm-card-padding),
// 16px), je nachdem welche Regel zuletzt gewann. Bei den Pillen: 20
// verschiedene Innenabstaende und Schriftgroessen von 10px bis 14px, dazu
// .78rem, .8rem und .82rem dazwischen.
//
// Sichtbar ist das als Unruhe: zwei Kaesten nebeneinander, deren Inhalt
// unterschiedlich weit vom Rand steht, und Statuspillen, die in jeder Liste
// eine andere Groesse haben. Einzeln faellt keiner dieser Werte auf -- sie
// sind ja alle ungefaehr richtig. Zusammen sieht es unaufgeraeumt aus.
//
// Dieselbe Geschichte wie bei der Inhaltsbreite: ein Merkmal gab es
// (--crm-card-padding), benutzt hat es fast niemand.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// In den INTERNEN Stylesheets nimmt jeder Kasten und jede Pille ihre
// Innenabstaende, Eckenradien und Pillenschrift aus den Merkmalen. Wer einen
// Sonderwert braucht, traegt ihn unten mit Begruendung ein.
//
// Die oeffentliche Webseite ist ausgenommen: sie hat ein eigenes Raster mit
// clamp()-Abstaenden ueber mehrere Bildschirmbreiten. Das ist kein
// Versehen, sondern ein anderer Entwurf.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STIL = path.join(WURZEL, "app");

/** Die oeffentliche Webseite und die Entwurfsgalerie haben ihr eigenes Raster. */
const NICHT_INTERN = new Set([
  "public-website.css", "homepage-variants.css", "homepage-variants-image.css",
  "homepage-v7-realtor.css", "auth-light-theme.css",
]);

/** Woran ein Kasten zu erkennen ist. */
const KASTEN = /(^|[\s>+~.])([a-z0-9-]*-)?(card|kachel)\b|\b(metric-card|data-card|editor-card|history-card|lead-stage|lead-prep-item|publication-check|workflow-status-card)\b/i;
/** Woran eine Pille zu erkennen ist -- Navigationseintraege zaehlen nicht dazu. */
const PILLE = /(pill|badge|chip|-status\b|status-\w*pill)/i;
const KEINE_PILLE = /(nav-item|objektakte-|persistent-nav|-status-card|status-pill-)/i;

/**
 * Selektor -> Begruendung. Nur, was wirklich anders sein soll.
 * Der Grund ist Pflicht: eine Ausnahme ohne Begruendung ist ein Versehen.
 */
const AUSNAHMEN = {
  ".asset-modal": "Fenster ueber der Seite, nicht Teil des Seitenflusses -- eigene Rundung.",
  ".lead-modal": "Fenster ueber der Seite, nicht Teil des Seitenflusses -- eigene Rundung.",
  ".asset-modal-backdrop": "Abdunkelung hinter dem Fenster, kein Kasten.",
  ".lead-modal-backdrop": "Abdunkelung hinter dem Fenster, kein Kasten.",
  ".asset-modal-header": "Kopfzeile im Fenster, buendig mit dessen Rand.",
  ".asset-modal-close": "Schliessknopf, folgt den Knoepfen und nicht den Kaesten.",
  ".media-disclosure.owner-card": "Aufklapper ohne eigene Flaeche -- bewusst ohne Rundung.",
};

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

// --- Die Merkmale --------------------------------------------------------

const MERKMALE = [
  "--crm-card-padding", "--crm-card-padding-sm",
  "--crm-card-radius", "--crm-card-radius-sm",
  "--crm-pill-padding", "--crm-pill-padding-sm",
  "--crm-pill-radius", "--crm-pill-font", "--crm-pill-font-sm",
];

const dateien = (await readdir(STIL)).filter((n) => n.endsWith(".css")).sort();
const inhalte = new Map();
for (const datei of dateien) {
  inhalte.set(datei, (await readFile(path.join(STIL, datei), "utf8")).replace(/\r\n/g, "\n"));
}

for (const merkmal of MERKMALE) {
  const stellen = [];
  for (const datei of dateien) {
    const treffer = inhalte.get(datei).match(new RegExp(`${merkmal}\\s*:`, "g"));
    for (const _ of treffer ?? []) stellen.push(datei);
  }
  pruefe(stellen.length === 1,
    `${merkmal} ist ${stellen.length}-mal definiert${stellen.length ? ` (${[...new Set(stellen)].join(", ")})` : ""}.\n`
    + "  Genau eine Definition. Zwei Werte fuer dieselbe Zahl laufen auseinander, und\n"
    + "  welcher gewinnt, haengt an der Reihenfolge der Regeln oder der Stylesheets.");
}

// --- Jeder Kasten und jede Pille nimmt die Merkmale ----------------------

const schluessel = (sel) => sel
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/@import[^;]*;/g, "")
  .replace(/\s*([>+~,])\s*/g, "$1").replace(/\s+/g, " ").trim();

const befunde = [];

for (const datei of dateien) {
  if (NICHT_INTERN.has(datei)) continue;
  const text = inhalte.get(datei).replace(/\/\*[\s\S]*?\*\//g, "");
  for (const regel of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (regel[1].trimStart().startsWith("@")) continue;
    const sel = schluessel(regel[1]);
    if (Object.hasOwn(AUSNAHMEN, sel)) continue;

    // Eine Regel kann mehrere Selektoren tragen. Gezaehlt wird jeder fuer
    // sich: ".data-card select" ist ein Auswahlfeld, kein Kasten, auch wenn
    // "card" darin vorkommt. Und ".calendar-provider-status span" ist die
    // Beschriftung IN einer Pille, nicht die Pille.
    const einzeln = sel.split(",").map((s) => s.trim()).filter(Boolean);
    const letztesStueck = (s) => s.split(/[\s>+~]+/).filter(Boolean).at(-1) ?? "";
    const istInneres = (s) => /^[a-z][a-z0-9]*(:[a-z-]+)?$/.test(letztesStueck(s));

    const kasten = einzeln.some((s) => KASTEN.test(letztesStueck(s)) && !istInneres(s));
    const pille = einzeln.some((s) => PILLE.test(letztesStueck(s)) && !KEINE_PILLE.test(s) && !istInneres(s));
    const istKasten = kasten;
    const istPille = pille && !kasten;
    if (!istKasten && !istPille) continue;

    const block = regel[2];
    const pruefbar = istKasten
      ? [["padding", /(?<![-\w])padding\s*:\s*([^;!]+)/], ["border-radius", /border-radius\s*:\s*([^;!]+)/]]
      : [["padding", /(?<![-\w])padding\s*:\s*([^;!]+)/], ["border-radius", /border-radius\s*:\s*([^;!]+)/],
         ["font-size", /font-size\s*:\s*([^;!]+)/]];

    for (const [eigenschaft, muster] of pruefbar) {
      const treffer = muster.exec(block);
      if (!treffer) continue;
      const wert = treffer[1].trim();
      if (wert.includes("var(--crm-")) continue;
      if (/^(0|inherit|unset|revert|50%)$/.test(wert)) continue;
      befunde.push({ datei, sel, art: istKasten ? "Kasten" : "Pille", eigenschaft, wert });
    }
  }
}

pruefe(befunde.length === 0,
  `${befunde.length} Stellen setzen Abstand, Rundung oder Pillenschrift als Zahl statt ueber ein Merkmal:\n`
  + befunde.slice(0, 24).map((b) => `    ${b.art.padEnd(6)} app/${b.datei}  ${b.sel}  ${b.eigenschaft}: ${b.wert}`).join("\n")
  + (befunde.length > 24 ? `\n    ... und ${befunde.length - 24} weitere` : "") + "\n"
  + "  Zwei Kaesten nebeneinander, deren Inhalt unterschiedlich weit vom Rand steht,\n"
  + "  sieht unaufgeraeumt aus, ohne dass man sagen koennte welcher falsch ist.\n"
  + "  Entweder var(--crm-card-padding) und Verwandte benutzen, oder -- wenn die\n"
  + "  Flaeche wirklich anders sein soll -- in AUSNAHMEN in scripts/check-abstaende.mjs\n"
  + "  eintragen, mit Begruendung.");

// --- Keine Leiche in der Ausnahmeliste -----------------------------------

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

let nutzungen = 0;
for (const datei of dateien) {
  nutzungen += [...inhalte.get(datei).matchAll(/var\(--crm-(?:card|pill)-/g)].length;
}
console.log(`Abstaende: ${MERKMALE.length} Merkmale je einmal definiert, ${nutzungen} Stellen benutzen sie, `
  + `${Object.keys(AUSNAHMEN).length} begruendete Ausnahmen.`);
