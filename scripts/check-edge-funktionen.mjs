#!/usr/bin/env node
// Bewacht die Edge-Funktionen: dass es sie gibt, dass sie ausgespielt werden
// und dass das oeffentliche Formular erreichbar bleibt.
//
// WAS HIER SCHIEFGING
//
// Am 07.10.2026, unmittelbar vor dem Produktionsdeploy, standen auf PRODUKTION
// diese Fassungen:
//
//   website-inquiry           Fassung 1   31.08.2026
//   generate-property-expose  Fassung 1   31.08.2026
//
// auf BETA diese:
//
//   website-inquiry           Fassung 7   08.09.2026
//   generate-property-expose  Fassung 2   01.09.2026
//
// Grund: nichts im Projekt hat Edge-Funktionen je ausgespielt. Kein Workflow,
// kein Skript, kein package.json-Eintrag. Die beiden Fassungen auf PRODUKTION
// waren von Hand hochgeladen worden, und danach hat sie niemand mehr angefasst.
//
// Was das gekostet haette: Fassung 1 kennt nur kind GENERAL und PROPERTY. Der
// Worker schickt inzwischen auch SELLER_CHECK, VALUATION und SEARCH_PROFILE.
// Fassung 1 macht aus jedem unbekannten kind ein PROPERTY, verlangt dann einen
// slug und antwortet mit 400. Drei der fuenf oeffentlichen Formulare haetten
// auf PRODUKTION "Die Anfrage konnte nicht verarbeitet werden" gezeigt --
// stumm, denn der Worker war fehlerfrei und die Datenbank auch.
//
// Dieselbe Klasse wie der Honigtopf: der Weg nach draussen ist dicht, und
// niemand merkt es, weil jedes einzelne Stueck fuer sich in Ordnung ist.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// Die Fassungsnummer der ausgespielten Funktion kann sie nicht sehen -- dafuer
// braucht man das Netz, und eine Build-Pruefung darf nicht vom Netz abhaengen.
// Sie sichert stattdessen das, was die Drift ueberhaupt moeglich gemacht hat:
//
// 1. Jede Funktion mit Quellcode steht in der Liste, jeder Listeneintrag mit
//    imRepo hat Quellcode. Eine neue Funktion, die niemand eintraegt, faellt
//    beim Build auf statt beim Kunden.
// 2. Jede Funktion hat einen config.toml-Eintrag mit ausdruecklichem
//    verify_jwt, und zwar mit dem in der Liste verlangten Wert. Fehlt der
//    Eintrag, setzt die CLI beim Ausspielen true -- und jedes oeffentliche
//    Formular antwortet mit 401.
// 3. website-inquiry steht auf verify_jwt = false. Eigener Punkt, weil der
//    Schaden hier alle fuenf Formulare gleichzeitig trifft.
// 4. Beide Deploy-Ketten spielen die Funktionen aus, vor dem Worker. Ein
//    Worker, der eine aeltere Funktion ruft, ist genau der Fall von oben.
// 5. Die Projekt-Kennungen in der Liste und in config.toml stimmen ueberein.
// 6. seed-demo-assets geht nicht nach PRODUKTION.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { EDGE_FUNKTIONEN, PROJEKTE, WURZEL, auszuspielen, configEintraege, configProjekte } from "./edge-funktionen.mjs";

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const { text: config, eintraege } = await configEintraege();
const projekteConfig = await configProjekte(config);

// --- 1. Liste und Verzeichnis stimmen ueberein -----------------------------

const { readdir } = await import("node:fs/promises");
const verzeichnisse = (await readdir(path.join(WURZEL, "supabase/functions"), { withFileTypes: true }))
  .filter((e) => e.isDirectory()).map((e) => e.name).sort();

const nachName = new Map(EDGE_FUNKTIONEN.map((f) => [f.name, f]));

for (const name of verzeichnisse) {
  const eintrag = nachName.get(name);
  pruefe(eintrag,
    `supabase/functions/${name}/ hat keinen Eintrag in EDGE_FUNKTIONEN.\n`
    + "  Eine Funktion, die in der Liste fehlt, wird von keiner Deploy-Kette ausgespielt.\n"
    + "  Eintragen in scripts/edge-funktionen.mjs -- mit Umgebungen, verify_jwt und Zweck.");
  if (eintrag) {
    pruefe(eintrag.imRepo, `EDGE_FUNKTIONEN sagt zu "${name}" imRepo: false, aber supabase/functions/${name}/ existiert.`);
  }
}

for (const f of EDGE_FUNKTIONEN) {
  if (f.imRepo) {
    pruefe(verzeichnisse.includes(f.name),
      `EDGE_FUNKTIONEN nennt "${f.name}" mit imRepo: true, aber supabase/functions/${f.name}/ gibt es nicht.`);
  } else {
    pruefe(!verzeichnisse.includes(f.name), `"${f.name}" steht als imRepo: false, liegt aber im Verzeichnis.`);
  }
  pruefe(f.umgebungen.length > 0, `"${f.name}" ist keiner Umgebung zugeordnet.`);
  pruefe((f.zweck ?? "").length >= 40, `"${f.name}" hat keine brauchbare Zweckangabe.`);
}

// --- 2. und 3. config.toml ------------------------------------------------

for (const f of EDGE_FUNKTIONEN) {
  const eintrag = eintraege.get(f.name);
  pruefe(eintrag,
    `In supabase/config.toml fehlt [functions.${f.name}].\n`
    + "  Ohne Eintrag setzt die Supabase-CLI beim Ausspielen verify_jwt = true.\n"
    + (f.verifyJwt === false
      ? "  Fuer diese Funktion heisst das: jedes oeffentliche Formular antwortet mit 401."
      : "  Der Wert gehoert ausdruecklich hin, nicht als Vorgabe."));
  if (!eintrag) continue;

  pruefe(eintrag.verifyJwt !== null,
    `[functions.${f.name}] in supabase/config.toml setzt verify_jwt nicht ausdruecklich.`);
  pruefe(eintrag.verifyJwt === f.verifyJwt,
    `[functions.${f.name}] steht auf verify_jwt = ${eintrag.verifyJwt}, verlangt ist ${f.verifyJwt}.\n`
    + `  ${f.zweck}`);
}

for (const name of eintraege.keys()) {
  pruefe(nachName.has(name),
    `supabase/config.toml kennt [functions.${name}], EDGE_FUNKTIONEN nicht.\n`
    + "  Entweder gehoert sie in die Liste, oder der Eintrag ist eine Leiche.");
}

// --- 4. Beide Deploy-Ketten spielen die Funktionen aus ---------------------

const paket = JSON.parse(await readFile(path.join(WURZEL, "package.json"), "utf8"));
const skripte = paket.scripts ?? {};

for (const umgebung of ["beta", "production"]) {
  const kette = skripte[`deploy:${umgebung}`] ?? "";
  const schritte = kette.split("&&").map((s) => s.trim());
  const zugaenge = schritte.findIndex((s) => s === `pnpm run deploy:zugaenge:${umgebung}`);
  const funktionen = schritte.findIndex((s) => s === `pnpm run deploy:funktionen:${umgebung}`);
  const worker = schritte.findIndex((s) => /^wrangler deploy\b/.test(s));

  // Die Zugangspruefung steht ganz vorn, nicht irgendwo. Am 07.10.2026 fiel
  // das fehlende CLOUDFLARE_API_TOKEN erst auf, nachdem die Edge-Funktionen
  // auf PRODUKTION schon ausgespielt waren -- halber Stand, und das fehlende
  // Token stand von Anfang an im Protokoll.
  pruefe(zugaenge === 0,
    `"deploy:${umgebung}" beginnt nicht mit "pnpm run deploy:zugaenge:${umgebung}", `
    + `sondern mit "${schritte[0]}".\n`
    + "  Ein Deploy, dem ein Zugang fehlt, muss scheitern, bevor er etwas anfasst,\n"
    + "  nicht zwischen zwei Schreibvorgaengen.");
  pruefe(skripte[`deploy:zugaenge:${umgebung}`],
    `In package.json fehlt das Skript "deploy:zugaenge:${umgebung}".`);

  pruefe(funktionen >= 0,
    `"deploy:${umgebung}" spielt die Edge-Funktionen nicht aus.\n`
    + `  Erwartet ist der Schritt "pnpm run deploy:funktionen:${umgebung}".\n`
    + "  Genau diese Luecke hat die Funktionen auf PRODUKTION fuenf Wochen alt werden lassen.");
  pruefe(worker >= 0, `"deploy:${umgebung}" spielt den Worker nicht aus.`);
  if (funktionen >= 0 && worker >= 0) {
    pruefe(funktionen < worker,
      `"deploy:${umgebung}" spielt den Worker vor den Funktionen aus.\n`
      + "  Dann ruft der neue Worker fuer die Dauer des Deploys die alte Funktion.");
  }
  pruefe(skripte[`deploy:funktionen:${umgebung}`],
    `In package.json fehlt das Skript "deploy:funktionen:${umgebung}".`);
}

// --- 5. Projekt-Kennungen ------------------------------------------------

for (const [umgebung, kennung] of Object.entries(PROJEKTE)) {
  pruefe(projekteConfig[umgebung] === kennung,
    `supabase/config.toml fuehrt [remotes.${umgebung}] als "${projekteConfig[umgebung] ?? "fehlt"}", `
    + `PROJEKTE in scripts/edge-funktionen.mjs als "${kennung}".\n`
    + "  Auseinanderlaufende Kennungen heissen: ausgespielt wird in das falsche Projekt.");
}

// --- 6. Kein Demobestand auf PRODUKTION ----------------------------------

const demo = nachName.get("seed-demo-assets");
pruefe(!demo || !demo.umgebungen.includes("production"),
  "seed-demo-assets ist fuer PRODUKTION eingetragen. Demobestand gehoert nicht in die echte Datenbank.");

if (fehler.length > 0) {
  console.error(`\nEdge-Funktionen: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

const beta = auszuspielen("beta").map((f) => f.name);
const prod = auszuspielen("production").map((f) => f.name);
console.log(`Edge-Funktionen: ${EDGE_FUNKTIONEN.length} erfasst, verify_jwt je Funktion ausdruecklich gesetzt; `
  + `BETA spielt ${beta.length} aus (${beta.join(", ")}), PRODUKTION ${prod.length} (${prod.join(", ")}) -- `
  + "beide vor dem Worker.");
