#!/usr/bin/env node
// Spielt die Edge-Funktionen aus -- der Schritt, den es bis zum 07.10.2026
// nicht gab. Siehe scripts/check-edge-funktionen.mjs, dort steht, was das
// gekostet haette.
//
//   node scripts/deploy-edge-funktionen.mjs <beta|production>
//
// Braucht SUPABASE_ACCESS_TOKEN. Das Token wird nicht ausgegeben, auch nicht
// gekuerzt: Deploy-Ausgaben landen in CI-Protokollen.
//
// Ausgespielt wird mit --project-ref, nicht mit "supabase link". Link legt
// Zustand in supabase/.temp ab, der zwischen BETA und PRODUKTION haengen
// bleibt; --project-ref steht in jedem Aufruf und kann nicht veralten.

import { spawnSync } from "node:child_process";
import { PROJEKTE, auszuspielen } from "./edge-funktionen.mjs";

const umgebung = process.argv[2];
if (!Object.hasOwn(PROJEKTE, umgebung)) {
  console.error("Aufruf: node scripts/deploy-edge-funktionen.mjs <beta|production>");
  process.exit(2);
}

if (!process.env.SUPABASE_ACCESS_TOKEN) {
  console.error(
    "Edge-Funktionen nicht ausgespielt: SUPABASE_ACCESS_TOKEN ist nicht gesetzt.\n"
    + "  In CI gehoert es als Secret in die Umgebung des Deploy-Jobs.\n"
    + "  Lokal: ein Token mit Schreibrecht auf das Projekt in die Umgebung legen.\n"
    + "  Ohne diesen Schritt laeuft der Worker gegen die zuletzt von Hand\n"
    + "  hochgeladene Fassung der Funktionen -- die kann Wochen alt sein.",
  );
  process.exit(1);
}

const kennung = PROJEKTE[umgebung];
const funktionen = auszuspielen(umgebung);

if (funktionen.length === 0) {
  console.error(`Fuer ${umgebung} ist keine Edge-Funktion eingetragen. Das ist vermutlich ein Fehler in scripts/edge-funktionen.mjs.`);
  process.exit(1);
}

console.log(`Edge-Funktionen nach ${umgebung.toUpperCase()} (${kennung}): ${funktionen.map((f) => f.name).join(", ")}`);

for (const funktion of funktionen) {
  // Die Fassung von verify_jwt kommt aus supabase/config.toml. Sie hier noch
  // einmal als Schalter mitzugeben waere eine zweite Wahrheit, und die beiden
  // wuerden irgendwann auseinanderlaufen. check:edge-funktionen prueft die
  // Datei dafuer bei jedem Build.
  const ergebnis = spawnSync(
    "npx",
    ["--yes", "supabase@latest", "functions", "deploy", funktion.name, "--project-ref", kennung],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
  if (ergebnis.error) {
    console.error(`${funktion.name}: ${ergebnis.error.message}`);
    process.exit(1);
  }
  if (ergebnis.status !== 0) {
    console.error(`\n${funktion.name} liess sich nicht ausspielen (Status ${ergebnis.status}).`);
    console.error(`  ${funktion.zweck}`);
    console.error("  Der Deploy bricht hier ab. Ein halb ausgespielter Stand ist schlechter als keiner.");
    process.exit(ergebnis.status ?? 1);
  }
}

console.log(`${funktionen.length} Edge-Funktion${funktionen.length === 1 ? "" : "en"} in ${umgebung.toUpperCase()} ausgespielt.`);
