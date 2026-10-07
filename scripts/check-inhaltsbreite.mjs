#!/usr/bin/env node
// Bewacht die Breite der Inhaltsspalte.
//
// WAS HIER SCHIEFGING
//
// app/styles.css definiert seit langem ein Merkmal dafuer:
//
//   --crm-content-max: 1320px;
//
// Benutzt haben es zwoelf Stellen. Vierunddreissig weitere schrieben die Zahl
// selbst hin -- und nicht dieselbe:
//
//   1120 px   Leads, Benachrichtigungen, Website-Veroeffentlichung
//   1180 px   Kalender, E-Mail, zweite und weitere Abschnitte der Objektakte
//   1320 px   alles uebrige
//
// Sichtbar war das als Sprung in der Fluchtlinie: wer von der Anfrage (1320)
// auf den Lead (1120) klickte, sah den ganzen Inhalt um hundert Pixel
// schmaler werden. Beim Zusammenfuehren von main kam es noch dazu, weil main
// die Breite in fuenf von dreizehn Stylesheets von 1120 auf 1320 gezogen hat
// und in den uebrigen nicht.
//
// Dazu war das Merkmal zweimal definiert, in app/styles.css und in
// app/responsive-data-card.css. Beide auf 1320px, also fiel nichts auf --
// aber welche Definition gewinnt, haengt an der Ladereihenfolge der
// Stylesheets, und zwei Quellen fuer eine Zahl laufen irgendwann auseinander.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// 1. --crm-content-max ist genau einmal definiert.
// 2. Keine Regel schreibt eine Inhaltsbreite als Zahl hin. Breiten zwischen
//    1000 und 1400 Pixeln sind fast immer die Inhaltsspalte; wer eine braucht,
//    traegt sie unten mit Begruendung ein.
//
// Ausgenommen sind nur Flaechen, die bewusst anders breit sind: Fenster, die
// CMS-Werkstatt, die Auswertungen und die oeffentliche Seite, die ein eigenes
// Raster hat. Media-Query-Bedingungen (@media (max-width: 1020px)) sind keine
// Breiten und werden nicht angefasst.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STIL = path.join(WURZEL, "app");

const MERKMAL = "--crm-content-max";
const UNTEN = 1000;
const OBEN = 1400;

/** Selektor -> Begruendung. Nur Flaechen, die absichtlich anders breit sind. */
const AUSNAHMEN = {
  ".reporting-shell":
    "Auswertungen mit breiten Tabellen und Diagrammen -- 1460px, bewusst breiter als die Akten.",
  ".website-cms-shell":
    "Die CMS-Werkstatt zeigt Eingabe und Vorschau nebeneinander und braucht dafuer mehr Platz.",
  ".website-preview-frame>.public-site":
    "Der Rahmen bildet die oeffentliche Seite nach, nicht die Inhaltsspalte des CRM.",
  ".asset-modal":
    "Fenster ueber der Seite, nicht Teil des Seitenflusses.",
  ".hv7r-hero-copy": "Entwurfsgalerie fuer die Startseite, eigenes Raster.",
  ".hv7-copy": "Entwurfsgalerie fuer die Startseite, eigenes Raster.",
  ".hv-overview-hero,.hv-overview-grid,.hv-current-link,.hv-version>section":
    "Entwurfsgalerie fuer die Startseite, eigenes Raster.",
  ".hv2-hero h1":
    "Zeilenlaenge einer Ueberschrift, keine Seitenbreite.",
};

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const dateien = (await readdir(STIL)).filter((n) => n.endsWith(".css")).sort();

// --- 1. Das Merkmal ist genau einmal definiert ----------------------------

const definitionen = [];
for (const datei of dateien) {
  const text = (await readFile(path.join(STIL, datei), "utf8")).replace(/\r\n/g, "\n");
  for (const m of text.matchAll(new RegExp(`${MERKMAL}\\s*:\\s*([^;]+);`, "g"))) {
    definitionen.push({ datei, wert: m[1].trim() });
  }
}

pruefe(definitionen.length === 1,
  `${MERKMAL} ist ${definitionen.length}-mal definiert:\n`
  + definitionen.map((d) => `    app/${d.datei}: ${d.wert}`).join("\n") + "\n"
  + "  Welche Definition gewinnt, haengt an der Ladereihenfolge der Stylesheets.\n"
  + "  Zwei Quellen fuer eine Zahl laufen irgendwann auseinander. Eine behalten.");

// --- 2. Keine Zahl, wo das Merkmal hingehoert -----------------------------

const schluessel = (sel) => sel
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/@import[^;]*;/g, "")
  .replace(/\s*([>+~,])\s*/g, "$1")
  .replace(/\s+/g, " ")
  .trim();

const gefunden = [];
for (const datei of dateien) {
  const text = (await readFile(path.join(STIL, datei), "utf8")).replace(/\r\n/g, "\n");
  for (const regel of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    // Eine At-Regel ist eine Bedingung, keine Deklaration: @media (max-width: 1020px)
    // nennt einen Umbruchpunkt, nicht die Breite eines Kastens.
    if (regel[1].trimStart().startsWith("@")) continue;
    const sel = schluessel(regel[1]);
    for (const w of regel[2].matchAll(/(?:max-width|width)\s*:\s*(?:min\(\s*)?(\d{3,4})px/g)) {
      const px = Number(w[1]);
      if (px < UNTEN || px > OBEN) continue;
      if (Object.hasOwn(AUSNAHMEN, sel)) continue;
      gefunden.push({ datei, sel, px });
    }
  }
}

pruefe(gefunden.length === 0,
  `Diese Regeln schreiben eine Inhaltsbreite als Zahl hin statt var(${MERKMAL}):\n`
  + gefunden.map((g) => `    ${String(g.px).padStart(4)}px  app/${g.datei}  ${g.sel}`).join("\n") + "\n"
  + `  So entsteht der Sprung in der Fluchtlinie zwischen zwei Seiten.\n`
  + `  Entweder var(${MERKMAL}) benutzen, oder -- wenn die Flaeche wirklich anders\n`
  + "  breit sein soll -- in AUSNAHMEN in scripts/check-inhaltsbreite.mjs eintragen,\n"
  + "  mit Begruendung.");

// --- 3. Keine Leiche in der Ausnahmeliste ---------------------------------

const alleSelektoren = new Set();
for (const datei of dateien) {
  const text = (await readFile(path.join(STIL, datei), "utf8")).replace(/\r\n/g, "\n");
  for (const regel of text.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (regel[1].trimStart().startsWith("@")) continue;
    alleSelektoren.add(schluessel(regel[1]));
  }
}
for (const [sel, grund] of Object.entries(AUSNAHMEN)) {
  pruefe(grund.length >= 25, `Die Ausnahme "${sel}" hat keine brauchbare Begruendung.`);
  pruefe(alleSelektoren.has(sel),
    `AUSNAHMEN nennt "${sel}", aber kein Stylesheet hat diesen Selektor mehr.`);
}

if (fehler.length > 0) {
  console.error(`\nInhaltsbreite: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

let nutzungen = 0;
for (const datei of dateien) {
  const text = await readFile(path.join(STIL, datei), "utf8");
  nutzungen += [...text.matchAll(new RegExp(`var\\(${MERKMAL}`, "g"))].length;
}
console.log(`Inhaltsbreite: ${MERKMAL} einmal definiert (${definitionen[0]?.wert}), `
  + `${nutzungen} Stellen benutzen es, ${Object.keys(AUSNAHMEN).length} begruendete Ausnahmen.`);
