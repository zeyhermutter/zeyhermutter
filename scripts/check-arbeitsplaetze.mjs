#!/usr/bin/env node
// Bewacht die Arbeitsplaetze -- Liste links, Datensatz rechts.
//
// WIE DAS AUFKAM
//
// Am 12.10.2026 bekamen erst die Immobilien, dann die Kontakte diesen
// Aufbau. Alle weiteren Bereiche sollen folgen. Zwei Dinge gehen dabei
// leicht schief, und beide sieht man erst, wenn man danach sucht:
//
// 1. Ein Bereich baut den Aufbau von Hand nach, statt den Baustein
//    app/components/arbeitsplatz.tsx zu benutzen. Dann sieht er nach dem
//    naechsten Umbau anders aus als die anderen -- Suchfeld woanders, Fuss
//    ohne Zaehler --, und in einem Programm muss sich jeder Bereich gleich
//    anfuehlen.
//
// 2. Eine Unterseite eines Datensatzes hat keinen Reiter, oder ein Reiter
//    zeigt auf eine Seite, die es nicht gibt. Die Seite ist dann nur ueber
//    einen versteckten Verweis erreichbar -- genau der Zustand, aus dem die
//    Kontaktakte am 12.10.2026 herausgeholt wurde.
//
// WAS GEPRUEFT WIRD
//
// - Jede Arbeitsplatz-Layout-Route in app/routes.ts ist eine Datei, die den
//   Baustein importiert, und sie haengt ohne eigenen Pfad (layout(), nicht
//   route()) -- damit keine Adresse sich aendert.
// - Ausserhalb des Bausteins baut niemand die Liste nach.
// - Wo ein Arbeitsplatz seine Reiter mit ArbeitsplatzReiter setzt: jede
//   Unterseite im Layout hat genau einen Reiter, jeder Reiter genau eine
//   Unterseite.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFile(path.join(WURZEL, p), "utf8").then((t) => t.replace(/\r\n/g, "\n"));
const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const routen = await lies("app/routes.ts");

// --- Arbeitsplatz-Layouts finden ----------------------------------------

const layouts = [...routen.matchAll(/layout\("(routes\/[a-z-]*arbeitsplatz\.tsx)",\s*\[([\s\S]*?)\n\s*\]\)/g)]
  .map((m) => ({ datei: `app/${m[1]}`, kinder: [...m[2].matchAll(/route\("([^"]+)"/g)].map((r) => r[1]) }));

pruefe(layouts.length >= 2,
  `In app/routes.ts wurden ${layouts.length} Arbeitsplatz-Layouts gefunden, erwartet mindestens 2\n`
  + "  (Immobilien und Kontakte). Entweder wurde einer entfernt, oder die Form in\n"
  + "  app/routes.ts hat sich geaendert.");

pruefe(!/route\("[^"]*",\s*"routes\/[a-z-]*arbeitsplatz\.tsx"/.test(routen),
  "Ein Arbeitsplatz haengt als route() mit eigenem Pfad in app/routes.ts.\n"
  + "  Er gehoert als layout() ohne Pfad um die Seiten -- sonst aendern sich Adressen.");

for (const { datei, kinder } of layouts) {
  const quelle = await lies(datei);
  pruefe(/from "~\/components\/arbeitsplatz"/.test(quelle) && /<Arbeitsplatz\b/.test(quelle),
    `${datei} benutzt den Baustein app/components/arbeitsplatz.tsx nicht.\n`
    + "  Ein von Hand gebauter Arbeitsplatz sieht nach dem naechsten Umbau anders aus als die anderen.");
  pruefe(kinder.length > 0, `${datei} umschliesst keine Seite.`);

  // Reiter gegen Unterseiten, wo sie ueber ArbeitsplatzReiter gesetzt werden.
  if (!/<ArbeitsplatzReiter\b/.test(quelle)) continue;
  const reiterBlock = /eintraege=\{\[([\s\S]*?)\]\}/.exec(quelle);
  pruefe(Boolean(reiterBlock), `${datei}: die Reiterliste (eintraege={[...]}) liess sich nicht lesen.`);
  if (!reiterBlock) continue;

  // Reiter-Pfade sind `${basis}` oder `${basis}/unterseite`.
  const reiterEndungen = [...reiterBlock[1].matchAll(/pfad:\s*(?:basis|`\$\{basis\}([^`]*)`)/g)].map((m) => m[1] ?? "");
  // Unterseiten: was nach dem ersten :parameter steht.
  const kinderEndungen = kinder.map((k) => k.replace(/^.*?:[A-Za-z]+/, ""));

  for (const endung of kinderEndungen) {
    const n = reiterEndungen.filter((r) => r === endung).length;
    pruefe(n === 1,
      `${datei}: die Unterseite "${endung || "(Stamm)"}" hat ${n} Reiter, erwartet genau einen.\n`
      + "  Ohne Reiter ist sie nur ueber einen versteckten Verweis erreichbar.");
  }
  for (const endung of reiterEndungen) {
    pruefe(kinderEndungen.includes(endung),
      `${datei}: der Reiter "${endung || "(Stamm)"}" zeigt auf eine Seite, die im Layout nicht haengt.`);
  }
}

// --- "Volle Liste" fuehrt wirklich auf die Liste -----------------------------
//
// Seit 12.10.2026 oeffnet "/crm/contacts" ohne Parameter gleich den ersten
// Kontakt im Arbeitsplatz; die Tabelle gibt es nur mit ?ansicht=tabelle.
// Zeigt "Volle Liste" auf die nackte Adresse, landet man wieder in der Akte,
// aus der man kam -- der Verweis tut scheinbar nichts. Deshalb: leitet die
// Listenseite ohne "ansicht" um, muss "Volle Liste" die Ansicht mitgeben.

const routenDateien = new Map([...routen.matchAll(/route\("([^"]+)",\s*"(routes\/[^"]+)"/g)].map((m) => [`/${m[1]}`, `app/${m[2]}`]));

for (const { datei } of layouts) {
  const quelle = await lies(datei);
  const volle = /volleListe="([^"]+)"/.exec(quelle)?.[1];
  pruefe(Boolean(volle), `${datei}: volleListe="..." fehlt oder ist kein fester Pfad.`);
  if (!volle) continue;
  const [pfad, abfrage = ""] = volle.split("?");
  const listenDatei = routenDateien.get(pfad);
  pruefe(Boolean(listenDatei), `${datei}: "Volle Liste" zeigt auf ${pfad}, das in app/routes.ts nicht haengt.`);
  if (!listenDatei) continue;
  const liste = await lies(listenDatei);
  const leitetUm = /throw redirect\(/.test(liste) && /"ansicht"/.test(liste);
  if (leitetUm) {
    pruefe(/(^|&)ansicht=tabelle(&|$)/.test(abfrage),
      `${datei}: "Volle Liste" zeigt auf ${volle}, aber ${listenDatei} leitet ohne ?ansicht=tabelle\n`
      + "  in die erste Akte um. Der Verweis fuehrte zurueck in den Arbeitsplatz statt auf die Liste.");
    pruefe(!/method="get"/.test(liste) || /name="ansicht" value="tabelle"/.test(liste),
      `${listenDatei}: das Filterformular gibt ansicht=tabelle nicht mit. Wer alle Filter leert,\n`
      + "  landet sonst in der ersten Akte statt in der ungefilterten Tabelle.");
  }
}

// --- Niemand baut die Liste nach ------------------------------------------

const verdaechtig = [];
for (const ordner of ["app/routes", "app/components"]) {
  for (const datei of await readdir(path.join(WURZEL, ordner))) {
    if (!/\.tsx$/.test(datei) || datei === "arbeitsplatz.tsx") continue;
    const quelle = await lies(`${ordner}/${datei}`);
    if (/className="arbeitsplatz-liste"/.test(quelle)) verdaechtig.push(`${ordner}/${datei}`);
  }
}
for (const datei of verdaechtig) {
  pruefe(false, `${datei} baut die Arbeitsplatz-Liste von Hand nach. Den Baustein benutzen.`);
}

// --- Ergebnis -------------------------------------------------------------

if (fehler.length > 0) {
  console.error(`\nArbeitsplaetze: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Arbeitsplaetze: ${layouts.length} Bereiche mit Liste und Datensatz (${layouts.map((l) => path.basename(l.datei, ".tsx")).join(", ")}), `
  + `alle ueber den Baustein, ohne eigene Adresse, jede Unterseite mit Reiter.`);
