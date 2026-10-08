#!/usr/bin/env node
// Bewacht den senkrechten Abstand zwischen den Hauptbloecken einer Seite.
//
// WAS HIER SCHIEFGING
//
// Der Abstand zwischen zwei untereinanderstehenden Bloecken -- Seitenkopf,
// Kennzahlenreihe, Karte, Abschnitt -- stand an zwei Stellen gleichzeitig:
// in einer Aufzaehlung von elf Paaren ("die Karte nach der Kennzahlenreihe
// bekommt 20px") und zusaetzlich als eigener Aussenabstand am Baustein
// selbst ("die Kennzahlenreihe hat oben 34px").
//
// Gemessen am 08.10.2026 ueber neun Seitengeruese ergab das vier
// verschiedene Abstaende:
//
//    0,0 px   Kennzahlenreihe -> Karte   das Paar stand nur unter
//             .app-content, nicht unter .editor-shell. Auf jeder Listenseite
//             klebte die Kennzahlenreihe damit auf der Filterkarte.
//   20,3 px   Karte -> Karte
//   24,0 px   Kopf -> Karte              margin-bottom des Kopfes
//   34,0 px   Kopf -> Kennzahlenreihe    margin-top der Kennzahlenreihe
//
// Einzeln ist jeder dieser Werte plausibel. Untereinander sehen sie unruhig
// aus, ohne dass man sagen koennte, welcher der falsche ist.
//
// WAS JETZT GILT
//
// Zwei Werte, jeder von genau einer Regel gesetzt:
//
//   --crm-header-gap   nach dem Seitenkopf
//   --crm-block-gap    zwischen allen anderen Bloecken
//
// Die Bausteine selbst tragen keinen eigenen senkrechten Aussenabstand. Wer
// einen neuen Baustein baut, muss nichts eintragen -- die Regel greift ueber
// "> * + *" und kennt ihn schon.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// 1. Beide Merkmale sind genau einmal definiert.
// 2. Die beiden Rhythmusregeln gibt es, und sie decken alle vier
//    Seitencontainer ab.
// 3. Kein Baustein setzt sich selbst einen senkrechten Aussenabstand.
// 4. Kein Seitencontainer setzt "gap" als Kurzform -- das traefe die
//    senkrechte Achse mit und kaeme zum Abstand der Regel hinzu. Gemessen:
//    .reporting-shell hatte "gap: 18px" und damit 38 statt 20 Pixel.
// 5. Keine Routendatei setzt einem Baustein den Abstand per style-Attribut.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STIL = path.join(WURZEL, "app");

const NICHT_INTERN = new Set([
  "public-website.css", "homepage-variants.css", "homepage-variants-image.css",
  "homepage-v7-realtor.css", "auth-light-theme.css",
]);

/** Die Container, die eine Seite senkrecht gliedern. */
const CONTAINER = ["app-content", "editor-shell", "calendar-shell", "reporting-shell"];

/** Die Bausteine, die als eigenstaendiger Block untereinander stehen. */
const BLOECKE = [
  "editor-header", "app-header", "calendar-header", "reporting-header",
  "metric-grid", "dashboard-grid", "data-card", "editor-card",
  "property-section", "property-summary-grid", "property-workflow-section",
  "lead-page-width", "lead-detail-width", "notifications-page-width",
  "sales-readiness-overview-width", "publication-page", "organization-page",
  "contact-layout", "module04-content", "crm-search-page", "audit-page",
  "inquiry-page", "search-profile-page", "tasks-page",
];

/** Selektor -> Begruendung. Nur Bausteine, die wirklich anders stehen sollen. */
const AUSNAHMEN = {
  ".lead-section-stack>.data-card":
    "Karten in einem Raster, das seinen Abstand ueber row-gap regelt. Sie sind keine "
    + "unmittelbaren Kinder eines Seitencontainers; die Rhythmusregel greift bei ihnen "
    + "gar nicht, und margin: 0 haelt sie davon frei.",
  ".sales-readiness-overview-width > .data-card, .sales-readiness-overview-width > .metric-grid":
    "Dasselbe: Raster mit eigenem row-gap. Das margin: 0 setzt nichts zurueck, sondern "
    + "haelt aeltere Sonderabstaende aus der Zeit vor dieser Regel heraus.",
};

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const dateien = (await readdir(STIL)).filter((n) => n.endsWith(".css")).sort();
const inhalte = new Map();
for (const datei of dateien) {
  inhalte.set(datei, (await readFile(path.join(STIL, datei), "utf8")).replace(/\r\n/g, "\n"));
}
const ohneKommentar = (text) => text.replace(/\/\*[\s\S]*?\*\//g, (m) => " ".repeat(m.length));

// --- 1. Die beiden Merkmale genau einmal ---------------------------------

/** Alles in @media-Bloecken herausnehmen: eine Neufestsetzung fuer schmale
 *  Fenster ist eine zweite Groesse, aber keine zweite Quelle. */
function ohneMedienabfragen(text) {
  let aus = "", tiefe = 0, i = 0;
  while (i < text.length) {
    if (tiefe === 0) {
      const at = text.indexOf("@media", i);
      if (at === -1) { aus += text.slice(i); break; }
      aus += text.slice(i, at);
      i = text.indexOf("{", at);
      if (i === -1) break;
      tiefe = 1; i += 1;
      continue;
    }
    if (text[i] === "{") tiefe += 1;
    else if (text[i] === "}") tiefe -= 1;
    i += 1;
  }
  return aus;
}

for (const merkmal of ["--crm-block-gap", "--crm-header-gap"]) {
  const stellen = [];
  for (const datei of dateien) {
    const text = ohneMedienabfragen(ohneKommentar(inhalte.get(datei)));
    for (const _ of text.match(new RegExp(`${merkmal}\\s*:`, "g")) ?? []) stellen.push(datei);
  }
  pruefe(stellen.length === 1,
    `${merkmal} ist ${stellen.length}-mal ausserhalb einer Medienabfrage definiert`
    + `${stellen.length ? ` (${[...new Set(stellen)].join(", ")})` : ""}.\n`
    + "  Zwei Quellen fuer denselben Abstand laufen auseinander, und welche gewinnt,\n"
    + "  haengt an der Ladereihenfolge der Stylesheets.");
}

// --- 2. Die beiden Rhythmusregeln ----------------------------------------

const alleRegeln = [];
for (const datei of dateien) {
  if (NICHT_INTERN.has(datei)) continue;
  for (const regel of ohneKommentar(inhalte.get(datei)).matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    if (regel[1].trimStart().startsWith("@")) continue;
    alleRegeln.push({ datei, sel: regel[1].replace(/\s+/g, " ").trim(), block: regel[2] });
  }
}

for (const container of CONTAINER) {
  pruefe(alleRegeln.some((r) => r.sel.includes(`.${container} > * + *`) && r.block.includes("--crm-block-gap")),
    `Fuer .${container} fehlt die Regel "> * + *" mit var(--crm-block-gap).\n`
    + "  Ohne sie haben die Bloecke dieser Seiten keinen gemeinsamen Abstand mehr.");
}
pruefe(alleRegeln.some((r) => /\.editor-shell > \.editor-header \+ \*/.test(r.sel) && r.block.includes("--crm-header-gap")),
  "Die Ausnahme nach dem Seitenkopf (.editor-shell > .editor-header + *) fehlt.");

// --- 3. Kein Baustein mit eigenem senkrechten Aussenabstand --------------

/** Senkrechter Anteil einer margin-Kurzform. Gibt null zurueck, wenn 0. */
function senkrechterAnteil(eigenschaft, wert) {
  const teile = wert.trim().split(/\s+/);
  const istNull = (v) => /^0(px|rem|em|%)?$/.test(v);
  if (eigenschaft === "margin-top" || eigenschaft === "margin-bottom") {
    return istNull(teile[0]) ? null : `${eigenschaft}: ${wert.trim()}`;
  }
  const oben = teile[0];
  const unten = teile.length >= 3 ? teile[2] : teile[0];
  if (istNull(oben) && istNull(unten)) return null;
  return `margin: ${wert.trim()}`;
}

const befunde = [];
for (const regel of alleRegeln) {
  const letztes = regel.sel.split(",")[0].split(/[\s>+~]+/).filter(Boolean).at(-1) ?? "";
  const baustein = BLOECKE.find((b) => letztes === `.${b}` || letztes.startsWith(`.${b}.`) || letztes.endsWith(`.${b}`));
  if (!baustein) continue;
  if (Object.hasOwn(AUSNAHMEN, regel.sel)) continue;
  for (const m of regel.block.matchAll(/(?<![-\w])(margin|margin-top|margin-bottom)\s*:\s*([^;!}]+)/g)) {
    // Auch "margin: 0 auto" ist ein Befund: die Kurzform setzt margin-top auf
    // 0 zurueck. Sie und die Rhythmusregel haben dieselbe Spezifitaet --
    // welche gewinnt, haengt dann allein an der Ladereihenfolge der
    // Stylesheets. Waagerecht zentriert wird mit margin-left/-right.
    if (m[1] === "margin") {
      befunde.push({ datei: regel.datei, sel: regel.sel, baustein,
        treffer: `margin: ${m[2].trim()}   ->   margin-left/-right` });
      continue;
    }
    const treffer = senkrechterAnteil(m[1], m[2]);
    if (treffer) befunde.push({ datei: regel.datei, sel: regel.sel, treffer, baustein });
  }
}
pruefe(befunde.length === 0,
  `${befunde.length} Bausteine setzen sich selbst einen senkrechten Aussenabstand:\n`
  + befunde.map((b) => `    app/${b.datei}  ${b.sel.slice(0, 80)}\n             ${b.treffer}`).join("\n") + "\n"
  + "  Der kommt zum Abstand der Rhythmusregel hinzu -- oder setzt ihn zurueck --\n"
  + "  und nur dort, wo dieser Baustein steht. Genau so entstanden die vier\n"
  + "  verschiedenen Abstaende.\n"
  + "  Entweder den Abstand weglassen, oder -- wenn der Baustein wirklich anders\n"
  + "  stehen soll -- in AUSNAHMEN in scripts/check-senkrechter-rhythmus.mjs\n"
  + "  eintragen, mit Begruendung.");

for (const [sel, grund] of Object.entries(AUSNAHMEN)) {
  pruefe(grund.length >= 25, `Die Ausnahme "${sel}" hat keine brauchbare Begruendung.`);
  pruefe(alleRegeln.some((r) => r.sel === sel),
    `AUSNAHMEN nennt "${sel}", aber kein Stylesheet hat diesen Selektor mehr.`);
}

// --- 4. Kein Seitencontainer mit gap-Kurzform ----------------------------

for (const regel of alleRegeln) {
  const container = CONTAINER.find((c) => regel.sel === `.${c}`);
  if (!container) continue;
  pruefe(!/(?<![-\w])gap\s*:/.test(regel.block),
    `.${container} setzt "gap" als Kurzform (app/${regel.datei}).\n`
    + "  Das trifft die senkrechte Achse mit und addiert sich auf den Abstand der\n"
    + "  Rhythmusregel. Getrennt schreiben: row-gap: 0 und column-gap: <wert>.");
}

// --- 5. Kein Abstand per style-Attribut an einem Baustein ----------------

async function tsxDateien(ordner, gesammelt = []) {
  for (const eintrag of await readdir(path.join(WURZEL, ordner), { withFileTypes: true })) {
    const pfad = `${ordner}/${eintrag.name}`;
    if (eintrag.isDirectory()) await tsxDateien(pfad, gesammelt);
    else if (eintrag.name.endsWith(".tsx")) gesammelt.push(pfad);
  }
  return gesammelt;
}

const inline = [];
for (const datei of await tsxDateien("app")) {
  const quelle = await readFile(path.join(WURZEL, datei), "utf8");
  // className und style am selben Element, in beliebiger Reihenfolge.
  for (const m of quelle.matchAll(/<[A-Za-z][^>]*?>/g)) {
    const tag = m[0];
    if (!/style=\{\{[^}]*margin(Top|Bottom)\s*:/.test(tag)) continue;
    const klassen = /className=(?:"([^"]*)"|\{`([^`]*)`\})/.exec(tag);
    const text = `${klassen?.[1] ?? ""} ${klassen?.[2] ?? ""}`;
    const baustein = BLOECKE.find((b) => new RegExp(`(^|[\\s"\`{])${b}([\\s"\`}]|$)`).test(text));
    if (!baustein) continue;
    inline.push({ datei, baustein, zeile: quelle.slice(0, m.index).split("\n").length });
  }
}
pruefe(inline.length === 0,
  `${inline.length} Bausteine bekommen ihren senkrechten Abstand per style-Attribut:\n`
  + inline.map((i) => `    ${i.datei}:${i.zeile}  ${i.baustein}`).join("\n") + "\n"
  + "  Damit gilt dieser Abstand auf genau einer Seite und nirgends sonst.\n"
  + "  Der Abstand zwischen zwei Bloecken kommt aus der Rhythmusregel.");

// --- Ergebnis -------------------------------------------------------------

if (fehler.length > 0) {
  console.error(`\nSenkrechter Rhythmus: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Senkrechter Rhythmus: zwei Merkmale je einmal definiert, `
  + `${CONTAINER.length} Seitencontainer mit derselben Regel, `
  + `${BLOECKE.length} Bausteine ohne eigenen senkrechten Aussenabstand, `
  + `${Object.keys(AUSNAHMEN).length} begruendete Ausnahmen.`);
