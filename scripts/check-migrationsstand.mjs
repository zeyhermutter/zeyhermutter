#!/usr/bin/env node
// Bewacht den Migrations-Guard selbst -- ohne eine Datenbank zu fragen.
//
// scripts/pruefe-migrationsstand.mjs haelt einen Deploy an, wenn die
// Ziel-Datenbank nicht zum Code passt. Er laeuft nur beim Deploy, also selten
// -- und ein Guard, der selten laeuft, kann lange kaputt sein, ohne dass es
// jemand merkt. Diese Pruefung laeuft bei jedem Build und stellt drei Dinge
// sicher:
//
// 1. Die Rechnung stimmt. vergleiche() wird an Faellen geprueft, die es
//    wirklich gab -- darunter der vom 12.10.2026, als BETA eine Migration
//    unter falscher Nummer und eine gar nicht verbucht hatte.
//
// 2. Jede Datei in supabase/migrations/ hat einen lesbaren Namen. Eine Datei,
//    deren Version sich nicht lesen laesst, kann der Guard nicht vergleichen.
//
// 3. Beide Deploy-Ketten rufen den Guard auf, und zwar VOR dem ersten
//    Schreibvorgang. Ein Guard, der nach den Edge-Funktionen laeuft, meldet
//    das Problem, nachdem es schon entstanden ist.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { repoMigrationen, vergleiche, versionAusDatei } from "./migrationsstand.mjs";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };
const gleich = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// --- 1. Die Rechnung ------------------------------------------------------

const FAELLE = [
  {
    name: "Datenbank und Repo gleich",
    repo: ["20260101000000", "20260102000000"],
    ziel: ["20260101000000", "20260102000000"],
    erwartet: { fehlen: [], fremd: [] },
  },
  {
    name: "PRODUKTION am 12.10.2026: die beiden Aufmass-Migrationen fehlen",
    repo: ["20260908175244", "20261008014300", "20261008113000"],
    ziel: ["20260908175244"],
    erwartet: { fehlen: ["20261008014300", "20261008113000"], fremd: [] },
  },
  {
    name: "BETA am 12.10.2026: eine unter falscher Nummer, eine gar nicht verbucht",
    repo: ["20260908175244", "20261008014300", "20261008113000"],
    ziel: ["20260908175244", "20261008193629"],
    erwartet: { fehlen: ["20261008014300", "20261008113000"], fremd: ["20261008193629"] },
  },
  {
    name: "Reihenfolge der Eingabe spielt keine Rolle",
    repo: ["20260102000000", "20260101000000"],
    ziel: ["20260101000000", "20260102000000"],
    erwartet: { fehlen: [], fremd: [] },
  },
  {
    name: "leere Datenbank: alles fehlt",
    repo: ["20260101000000"],
    ziel: [],
    erwartet: { fehlen: ["20260101000000"], fremd: [] },
  },
];

for (const fall of FAELLE) {
  const ergebnis = vergleiche(fall.repo, fall.ziel);
  pruefe(gleich(ergebnis, fall.erwartet),
    `vergleiche() rechnet falsch: ${fall.name}\n`
    + `  erwartet ${JSON.stringify(fall.erwartet)}\n`
    + `  erhalten ${JSON.stringify(ergebnis)}`);
}

pruefe(versionAusDatei("20261008014300_measurement_order_module.sql") === "20261008014300",
  "versionAusDatei() liest einen gueltigen Namen nicht.");
for (const ungueltig of ["2026_kurz.sql", "20261008014300-strich.sql", "20261008014300_Gross.sql", "notiz.md"]) {
  pruefe(versionAusDatei(ungueltig) === null,
    `versionAusDatei() nimmt "${ungueltig}" an -- dieser Name ist nicht gueltig.`);
}

// --- 2. Jede Migration hat einen lesbaren Namen ---------------------------

const { migrationen, ungueltig } = await repoMigrationen(WURZEL);
for (const datei of ungueltig) {
  pruefe(false,
    `supabase/migrations/${datei} hat keinen gueltigen Namen.\n`
    + "  Erwartet: <14 Ziffern>_<name_in_kleinbuchstaben>.sql. Der Migrations-Guard\n"
    + "  kann eine Datei, deren Version er nicht lesen kann, nicht vergleichen.");
}
const versionen = migrationen.map((m) => m.version);
for (const v of versionen.filter((v, i) => versionen.indexOf(v) !== i)) {
  pruefe(false, `Die Version ${v} kommt in supabase/migrations/ mehrfach vor.`);
}

// --- 3. Beide Ketten rufen den Guard, vor dem ersten Schreibvorgang -------

const skripte = JSON.parse(await readFile(path.join(WURZEL, "package.json"), "utf8")).scripts;

for (const umgebung of ["beta", "production"]) {
  const kette = skripte[`deploy:${umgebung}`] ?? "";
  const guard = `deploy:migrationsstand:${umgebung}`;
  const stelleGuard = kette.indexOf(guard);
  pruefe(stelleGuard >= 0,
    `deploy:${umgebung} ruft ${guard} nicht auf. Ohne ihn kann der Worker gegen\n`
    + "  eine Datenbank ausgespielt werden, der Tabellen fehlen -- genau der Stand\n"
    + "  von PRODUKTION am 12.10.2026.");
  pruefe(skripte[guard] === `node scripts/pruefe-migrationsstand.mjs ${umgebung}`,
    `${guard} zeigt nicht auf scripts/pruefe-migrationsstand.mjs ${umgebung}.`);

  for (const schreibend of [`deploy:funktionen:${umgebung}`, "wrangler deploy"]) {
    const stelle = kette.indexOf(schreibend);
    if (stelle < 0 || stelleGuard < 0) continue;
    pruefe(stelleGuard < stelle,
      `In deploy:${umgebung} laeuft ${guard} erst nach "${schreibend}".\n`
      + "  Dann meldet der Guard das Problem, nachdem es entstanden ist.");
  }
}

// --- Ergebnis -------------------------------------------------------------

if (fehler.length > 0) {
  console.error(`\nMigrationsstand: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Migrationsstand: Rechnung an ${FAELLE.length} Faellen richtig, ${migrationen.length} Migrationen mit gueltigem Namen, `
  + "beide Deploy-Ketten pruefen vor dem ersten Schreibvorgang.");
