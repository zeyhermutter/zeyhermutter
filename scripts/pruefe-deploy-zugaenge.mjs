#!/usr/bin/env node
// Prueft VOR dem ersten Schreibvorgang, ob alle Zugaenge da sind, die der
// Deploy bis zum Ende braucht.
//
//   node scripts/pruefe-deploy-zugaenge.mjs <beta|production>
//
// WAS HIER SCHIEFGING
//
// Der erste PRODUKTIONS-Deploy am 07.10.2026 lief so:
//
//   Guard              ok
//   13 Quellpruefungen ok
//   typecheck, Build   ok
//   Trockenlauf        ok
//   Edge-Funktionen    AUSGESPIELT -- website-inquiry und
//                      generate-property-expose gingen nach PRODUKTION
//   Worker             ABBRUCH
//
//     In a non-interactive environment, it's necessary to set a
//     CLOUDFLARE_API_TOKEN environment variable for wrangler to work.
//
// Im Protokoll des Schritts stand es sichtbar:
//
//     CLOUDFLARE_API_TOKEN:
//     CLOUDFLARE_ACCOUNT_ID:
//     SUPABASE_ACCESS_TOKEN: ***
//
// Die beiden Cloudflare-Geheimnisse lagen als Umgebungs-Geheimnisse an der
// GitHub-Umgebung "beta". Der PRODUKTIONS-Job laeuft in der Umgebung
// "production" und bekam leere Zeichenketten.
//
// Ergebnis: PRODUKTION stand sieben Minuten lang mit neuen Edge-Funktionen und
// altem Worker da. Hier ging es gut, weil die neue Funktion die alten
// Aufrufe weiter versteht. Das war Glueck, kein Entwurf.
//
// Der Guard prueft Zweig, Arbeitsverzeichnis und Freigabe -- aber nicht die
// Zugangsdaten, ohne die der letzte Schritt gar nicht laufen kann. Vier
// Minuten Build und ein Schreibvorgang auf PRODUKTION spaeter faellt auf, was
// in der ersten Sekunde zu sehen war.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// Jeder Zugang, den irgendein Schritt der Kette braucht, ist gesetzt, bevor
// der erste Schritt laeuft. Ein Deploy, der ohnehin scheitern wird, scheitert
// in zehn Sekunden und ohne etwas angefasst zu haben.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PROJEKTE, WURZEL } from "./edge-funktionen.mjs";

const umgebung = process.argv[2];
if (!Object.hasOwn(PROJEKTE, umgebung)) {
  console.error("Aufruf: node scripts/pruefe-deploy-zugaenge.mjs <beta|production>");
  process.exit(2);
}

const GITHUB_UMGEBUNG = { beta: "beta", production: "production" }[umgebung];

const ZUGAENGE = [
  {
    name: "CLOUDFLARE_API_TOKEN",
    braucht: "wrangler deploy -- der Worker",
    hinweis:
      "Ohne dieses Token bricht wrangler ab, nachdem die Edge-Funktionen schon\n"
      + "  ausgespielt sind. Genau das ist am 07.10.2026 auf PRODUKTION passiert.",
  },
  {
    name: "SUPABASE_ACCESS_TOKEN",
    braucht: "supabase functions deploy -- die Edge-Funktionen",
    hinweis: "Ohne dieses Token laeuft der Worker gegen eine moeglicherweise Wochen alte Funktion.",
  },
];

const fehlend = ZUGAENGE.filter((z) => !String(process.env[z.name] ?? "").trim());

if (fehlend.length > 0) {
  console.error(`\nDeploy nach ${umgebung.toUpperCase()} nicht gestartet: `
    + `${fehlend.length} Zugang${fehlend.length === 1 ? "" : "s-Angabe"} fehlt.\n`);
  for (const z of fehlend) {
    console.error(`- ${z.name} ist leer.`);
    console.error(`  Gebraucht fuer: ${z.braucht}`);
    console.error(`  ${z.hinweis}\n`);
  }
  console.error("In GitHub pruefen -- und dabei auf die UMGEBUNG achten:");
  console.error("  Settings -> Secrets and variables -> Actions");
  console.error(`  Ein Geheimnis unter "Environment secrets" der Umgebung "${GITHUB_UMGEBUNG}" gilt`);
  console.error("  NUR fuer Jobs in dieser Umgebung. Ein Geheimnis unter \"Repository secrets\"");
  console.error("  gilt fuer alle. Ein Deploy-Geheimnis, das beide Umgebungen brauchen,");
  console.error("  gehoert entweder in beide Umgebungen oder ins Repository.\n");
  process.exit(1);
}

// CLOUDFLARE_ACCOUNT_ID ist seit der Festschreibung in wrangler.json nicht mehr
// noetig. Ist sie trotzdem gesetzt und sagt etwas anderes, ist eine der beiden
// Angaben falsch -- und welche, merkt man erst am fremden Worker.
const gesetzteKonto = String(process.env.CLOUDFLARE_ACCOUNT_ID ?? "").trim();
if (gesetzteKonto) {
  const config = JSON.parse(await readFile(path.join(WURZEL, "wrangler.json"), "utf8"));
  if (gesetzteKonto !== config.account_id) {
    console.error(`\nDeploy nach ${umgebung.toUpperCase()} nicht gestartet: zwei verschiedene Cloudflare-Konten.\n`);
    console.error(`- CLOUDFLARE_ACCOUNT_ID in der Umgebung: ${gesetzteKonto}`);
    console.error(`- account_id in wrangler.json:           ${config.account_id}\n`);
    console.error("  Welches gilt, merkt man erst an einem Worker im falschen Konto.\n");
    process.exit(1);
  }
}

console.log(`Zugaenge fuer ${umgebung.toUpperCase()}: ${ZUGAENGE.map((z) => z.name).join(", ")} gesetzt`
  + (gesetzteKonto ? ", Konto-ID passt zu wrangler.json" : "")
  + ".");
