#!/usr/bin/env node
// Bewacht die Pruefketten selbst.
//
// WAS HIER SCHIEFGING
//
// Der Produktionsbuild wurde schwaecher geprueft als der Beta-Build:
//
//   check:beta        Marke, Goldschrift, Kopfbild, Anzeigeformate, rohe
//                     Enums, Leerbehauptungen, tote Beschriftungen,
//                     Honigtopf, Sitemap, Seitenkopf, typecheck, build
//   check:production   typecheck, build
//
// Das ist verkehrt herum. Zehn Pruefungen, die zusammen 33 rohe
// Datenbankwerte, 20 falsche Leermeldungen, 114 Formatierungskopien, eine
// tote Beschriftungstabelle, einen Honigtopf, der echte Anfragen verschluckte,
// elf fehlende Sitemap-Eintraege und fehlende Linkvorschauen gefunden haben,
// liefen vor einem Produktionsdeploy gar nicht.
//
// Keine dieser Pruefungen schaut auf die Umgebung. Sie lesen Quelldateien --
// Stylesheets, Routen, Skripte. Was auf BETA ein Fehler ist, ist es auf PROD
// erst recht.
//
// WIE DIE KETTEN JETZT GEBAUT SIND
//
//   check:quellen      alle Pruefungen auf den Quelldateien, dazu diese hier
//   check:beta         check:quellen + typecheck + build:beta      + dry-run
//   check:production   check:quellen + typecheck + build:production + dry-run
//
// Beide Ketten rufen dieselbe Liste auf. Auseinanderlaufen koennen sie damit
// nicht mehr -- es gibt nur noch eine.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// 1. Es gibt check:quellen, und beide Ketten rufen es auf.
// 2. Jedes check:-Skript im Projekt haengt in check:quellen. Wer eine neue
//    Pruefung schreibt und sie nirgends eintraegt, merkt es beim naechsten
//    Build statt gar nicht.
// 3. Jede Pruefung in der Liste gibt es auch als Skript.
// 4. Beide Ketten pruefen, bauen und laufen trocken -- in dieser Reihenfolge.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const paket = JSON.parse(await readFile(path.join(WURZEL, "package.json"), "utf8"));
const skripte = paket.scripts ?? {};

// Die Ketten selbst und die Sammelliste sind keine einzelnen Pruefungen.
const KEINE_EINZELPRUEFUNG = new Set(["check:beta", "check:production", "check:quellen"]);

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const sammel = skripte["check:quellen"];
pruefe(sammel, 'In package.json fehlt das Skript "check:quellen". Es haelt die Pruefungen zusammen, die beide Ketten brauchen.');

function teile(kette) {
  return (kette ?? "").split("&&").map((t) => t.trim());
}
function aufgerufenePruefungen(kette) {
  return teile(kette)
    .map((t) => /^pnpm run (check:[a-z-]+)$/.exec(t))
    .filter(Boolean)
    .map((m) => m[1]);
}

const inSammel = new Set(aufgerufenePruefungen(sammel));

// --- 1. Beide Ketten rufen die Sammelliste auf ------------------------------

for (const kette of ["check:beta", "check:production"]) {
  const schritte = teile(skripte[kette]);
  pruefe(skripte[kette], `In package.json fehlt das Skript "${kette}".`);
  pruefe(schritte[0] === "pnpm run check:quellen",
    `"${kette}" beginnt nicht mit "pnpm run check:quellen", sondern mit "${schritte[0]}".\n`
    + "  Beide Ketten muessen dieselbe Liste aufrufen, sonst laufen sie wieder auseinander.");
  pruefe(schritte.some((s) => s === "pnpm run typecheck"), `"${kette}" prueft die Typen nicht.`);
  pruefe(schritte.some((s) => /^pnpm run build:/.test(s)), `"${kette}" baut nichts.`);
  pruefe(schritte.some((s) => s.includes("--dry-run")), `"${kette}" laeuft nicht trocken gegen Cloudflare.`);
}

const bauBeta = teile(skripte["check:beta"]).find((s) => s.startsWith("pnpm run build:"));
const bauProd = teile(skripte["check:production"]).find((s) => s.startsWith("pnpm run build:"));
pruefe(bauBeta === "pnpm run build:beta", `"check:beta" baut "${bauBeta}" statt build:beta.`);
pruefe(bauProd === "pnpm run build:production", `"check:production" baut "${bauProd}" statt build:production.`);

// --- 2. Keine Pruefung haengt in der Luft ----------------------------------

const alle = Object.keys(skripte).filter((n) => n.startsWith("check:") && !KEINE_EINZELPRUEFUNG.has(n));
const vergessen = alle.filter((n) => !inSammel.has(n));
pruefe(vergessen.length === 0,
  `Diese Pruefungen stehen in package.json, laufen aber in keiner Kette:\n${vergessen.map((n) => `    ${n}`).join("\n")}\n`
  + "  Eine Pruefung, die niemand aufruft, prueft nichts. Sie gehoert in check:quellen.");

// --- 3. Keine Leiche in der Liste -----------------------------------------

const tote = [...inSammel].filter((n) => !skripte[n]);
pruefe(tote.length === 0,
  `check:quellen ruft Skripte auf, die es nicht gibt:\n${tote.map((n) => `    ${n}`).join("\n")}`);

pruefe(inSammel.has("check:pruefketten"), "check:quellen ruft check:pruefketten nicht auf -- dann bewacht sich diese Pruefung selbst nicht.");

if (fehler.length > 0) {
  console.error(`\nPruefketten: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Pruefketten: ${inSammel.size} Pruefungen in check:quellen, von BETA und PRODUKTION gleichermassen aufgerufen.`);
