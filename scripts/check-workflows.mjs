#!/usr/bin/env node
// Bewacht die Workflows gegen Auseinanderlaufen.
//
// WAS HIER SCHIEFGING
//
// Zweimal an einem Tag hat dieselbe Sache zugeschlagen: zwei Wege, die
// dasselbe tun sollen, tun es verschieden, und gemerkt hat es niemand, weil
// jeder Weg fuer sich lief.
//
//   check:beta prueft elf Sachen, check:production zwei.
//   Die Cloudflare-Geheimnisse haengen an "beta", der PROD-Job sieht sie nicht.
//
// Die dritte Stelle, an der das passieren kann, sind die Actions: drei
// Workflows, dieselben drei Actions, drei Gelegenheiten, eine davon zu
// vergessen. Wenn "Deploy BETA" auf einer anderen Checkout-Fassung laeuft als
// "Deploy PROD", pruefen sie nicht mehr dasselbe -- und der Unterschied faellt
// genau dann auf, wenn PROD dran ist.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// 1. Jede Action ist auf einen vollen Commit festgenagelt, nicht auf ein
//    bewegliches Etikett. Ein Etikett wie "@v4" zeigt morgen auf anderen Code;
//    wer das Etikett verschieben kann, bekommt den Cloudflare- und den
//    Supabase-Zugang dieses Deploys in die Hand.
// 2. Hinter jedem Commit steht als Kommentar, welche Fassung das ist. Ohne das
//    sieht niemand, wie alt der Pin ist.
// 3. Dieselbe Action steht in allen Workflows auf demselben Commit.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ORDNER = path.join(WURZEL, ".github/workflows");

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const dateien = (await readdir(ORDNER)).filter((n) => /\.ya?ml$/.test(n)).sort();
pruefe(dateien.length >= 3, `In .github/workflows liegen nur ${dateien.length} Workflows. Erwartet sind mindestens BETA, PRODUKTION und Quality Gate.`);

/** action -> Map(sha -> [datei:zeile]) */
const pins = new Map();

for (const datei of dateien) {
  const text = (await readFile(path.join(ORDNER, datei), "utf8")).replace(/\r\n/g, "\n");
  text.split("\n").forEach((zeile, i) => {
    const treffer = /^\s*-?\s*uses:\s*(\S+)\s*(?:#\s*(\S+))?/.exec(zeile);
    if (!treffer) return;
    const [, referenz, kommentar] = treffer;
    if (referenz.startsWith("./") || referenz.startsWith("docker://")) return;

    const stelle = `${datei}:${i + 1}`;
    const [action, version] = referenz.split("@");

    pruefe(/^[0-9a-f]{40}$/.test(version ?? ""),
      `${stelle}: ${referenz} ist nicht auf einen Commit festgenagelt.\n`
      + "  Ein bewegliches Etikett zeigt morgen auf anderen Code. Dieser Workflow\n"
      + "  bekommt die Cloudflare- und Supabase-Zugaenge in die Hand -- das ist zu viel,\n"
      + "  um es an einem Etikett haengen zu lassen.");

    pruefe(/^v\d/.test(kommentar ?? ""),
      `${stelle}: hinter dem Pin von ${action} fehlt die Fassung als Kommentar (z. B. "# v7.0.1").\n`
      + "  Ohne sie sieht niemand, wie alt der Pin ist.");

    if (!pins.has(action)) pins.set(action, new Map());
    const nachSha = pins.get(action);
    if (!nachSha.has(version)) nachSha.set(version, []);
    nachSha.get(version).push(stelle);
  });
}

for (const [action, nachSha] of pins) {
  pruefe(nachSha.size === 1,
    `${action} steht in den Workflows auf ${nachSha.size} verschiedenen Fassungen:\n`
    + [...nachSha].map(([sha, stellen]) => `    ${sha.slice(0, 12)}…  ${stellen.join(", ")}`).join("\n") + "\n"
    + "  Dann pruefen BETA und PRODUKTION nicht mehr dasselbe, und der Unterschied\n"
    + "  faellt genau dann auf, wenn PRODUKTION dran ist.");
}

if (fehler.length > 0) {
  console.error(`\nWorkflows: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Workflows: ${dateien.length} geprueft, ${pins.size} Actions auf je einen Commit festgenagelt, `
  + "in allen Workflows derselbe.");
