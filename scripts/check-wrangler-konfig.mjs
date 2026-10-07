#!/usr/bin/env node
// Bewacht wrangler.json -- die Datei, die zwei Leser mit unterschiedlich
// strengen Parsern haben.
//
// WAS HIER SCHIEFGING
//
// In wrangler.json stand ein Kommentar:
//
//   "name": "zeyhermutter",
//   // Das Cloudflare-Konto ist festgeschrieben, damit ein Deploy mit der
//   // falschen Anmeldung abbricht ...
//   "account_id": "4196e568...",
//
// Wrangler liest seine Konfiguration mit einem Parser, der Kommentare
// durchlaesst. Zwei andere Stellen tun das nicht:
//
//   .github/workflows/deploy-beta.yml   node -e "require('./wrangler.json')"
//   scripts/guard-production-deploy.mjs JSON.parse(readFileSync(...))
//
// Ergebnis: pnpm run check:beta und check:production liefen durch -- sie rufen
// "wrangler deploy --dry-run", und wrangler war zufrieden. Der BETA-Deploy
// brach danach im Schritt "Verify deploy target" ab:
//
//   SyntaxError: wrangler.json: Expected double-quoted property name in JSON
//   at position 89 (line 4 column 3)
//
// und der PRODUKTIONS-Deploy waere an derselben Zeile im Guard gescheitert,
// mit einem nackten Stacktrace statt einer Meldung.
//
// Die Falle ist die Asymmetrie: die Pruefkette benutzt den toleranten Parser,
// der Deploy den strengen. Eine Kette, die mit einem anderen Werkzeug prueft
// als der Deploy benutzt, prueft nicht den Deploy.
//
// Deshalb hat diese Datei keine Kommentare mehr. Was dort zu erklaeren war,
// steht hier.
//
// WARUM account_id FESTSTEHT
//
// Ein Deploy mit der falschen Anmeldung soll abbrechen, statt still einen neuen
// Worker in einem fremden Konto anzulegen. Das ist real moeglich: auf demselben
// Rechner laeuft ein zweites Projekt in einem anderen Cloudflare-Konto, und
// "wrangler login" gilt fuer den ganzen Windows-Benutzer. Eine Konto-ID ist
// kein Geheimnis.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// 1. wrangler.json ist striktes JSON -- genau der Parser, den der Deploy nimmt.
// 2. account_id steht drin und sieht aus wie eine Konto-ID.
// 3. Beide Umgebungen tragen den richtigen Worker-Namen und das richtige
//    APP_ENV.
// 4. Die SUPABASE_URL je Umgebung passt zu der Projekt-Kennung, in die
//    scripts/deploy-edge-funktionen.mjs ausspielt. Ein Worker auf BETA,
//    dessen Edge-Funktionen nach PRODUKTION gehen, waere schwer zu finden.
// 5. Kein Platzhalter und kein Dienstrollen-Schluessel.
// 6. Beide Umgebungen kennen dieselben Schalternamen. Ein Schalter, der nur in
//    einer Umgebung existiert, ist in der anderen stillschweigend aus.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { PROJEKTE, WURZEL } from "./edge-funktionen.mjs";

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const DATEI = path.join(WURZEL, "wrangler.json");
const roh = await readFile(DATEI, "utf8");

// --- 1. Striktes JSON ------------------------------------------------------

let config = null;
try {
  config = JSON.parse(roh);
} catch (ursache) {
  const zeile = /position (\d+)/.exec(ursache.message);
  const bis = zeile ? roh.slice(0, Number(zeile[1])).split("\n").length : null;
  fehler.push(
    `wrangler.json ist kein striktes JSON: ${ursache.message}\n`
    + (bis ? `  Betroffen ist etwa Zeile ${bis}.\n` : "")
    + "  Wrangler selbst laesst Kommentare durch, diese beiden Stellen nicht:\n"
    + "    .github/workflows/deploy-beta.yml   (Schritt \"Verify deploy target\")\n"
    + "    scripts/guard-production-deploy.mjs\n"
    + "  Ein Kommentar hier laesst beide Deploys abbrechen, obwohl die\n"
    + "  Pruefkette durchlaeuft. Erklaerungen gehoeren in\n"
    + "  scripts/check-wrangler-konfig.mjs, nicht in diese Datei.",
  );
}

if (config) {
  // --- 2. account_id -------------------------------------------------------

  pruefe(/^[0-9a-f]{32}$/.test(config.account_id ?? ""),
    `wrangler.json nennt kein brauchbares account_id (gefunden: ${JSON.stringify(config.account_id)}).\n`
    + "  Ohne feste Konto-ID legt ein Deploy mit der falschen Anmeldung still\n"
    + "  einen neuen Worker in einem fremden Konto an.");

  // --- 3. bis 6. je Umgebung ----------------------------------------------

  const ERWARTET = {
    beta: { name: "zeyhermutter", appEnv: "beta" },
    production: { name: "zeyhermutter-production", appEnv: "production" },
  };

  const schalter = {};

  for (const [umgebung, soll] of Object.entries(ERWARTET)) {
    const block = config.env?.[umgebung];
    pruefe(block, `wrangler.json kennt keine Umgebung "${umgebung}".`);
    if (!block) continue;
    const vars = block.vars ?? {};

    pruefe(block.name === soll.name,
      `Umgebung "${umgebung}" heisst "${block.name}", erwartet ist "${soll.name}".`);
    pruefe(vars.APP_ENV === soll.appEnv,
      `Umgebung "${umgebung}" setzt APP_ENV auf "${vars.APP_ENV}", erwartet ist "${soll.appEnv}".`);

    const kennung = PROJEKTE[umgebung];
    const erwarteteUrl = `https://${kennung}.supabase.co`;
    pruefe(vars.SUPABASE_URL === erwarteteUrl,
      `Umgebung "${umgebung}" zeigt auf SUPABASE_URL "${vars.SUPABASE_URL}",\n`
      + `  scripts/edge-funktionen.mjs spielt dort aber nach "${kennung}" aus (${erwarteteUrl}).\n`
      + "  Ein Worker auf der einen Datenbank und Edge-Funktionen auf der anderen:\n"
      + "  die Formulare schreiben dann ins falsche Projekt oder gar nicht.");

    for (const [name, wert] of Object.entries(vars)) {
      pruefe(!String(wert).includes("SET_PRODUCTION") && !String(wert).includes("PLACEHOLDER"),
        `Umgebung "${umgebung}" hat in ${name} noch einen Platzhalter: "${wert}".`);
      pruefe(!/^(eyJ|sb_secret_)/.test(String(wert)),
        `Umgebung "${umgebung}" hat in ${name} etwas, das wie ein Dienstrollen-Schluessel aussieht.\n`
        + "  wrangler.json liegt im Repo. Geheimnisse gehoeren in wrangler secret put.");
    }

    schalter[umgebung] = Object.keys(vars).sort();
  }

  if (schalter.beta && schalter.production) {
    const nurBeta = schalter.beta.filter((n) => !schalter.production.includes(n));
    const nurProd = schalter.production.filter((n) => !schalter.beta.includes(n));
    pruefe(nurBeta.length === 0 && nurProd.length === 0,
      "BETA und PRODUKTION kennen nicht dieselben Variablen:\n"
      + (nurBeta.length ? `    nur in BETA:       ${nurBeta.join(", ")}\n` : "")
      + (nurProd.length ? `    nur in PRODUKTION: ${nurProd.join(", ")}\n` : "")
      + "  Eine Variable, die nur eine Umgebung kennt, ist in der anderen\n"
      + "  stillschweigend leer -- und ein Schalter, der leer ist, ist aus.");
  }
}

if (fehler.length > 0) {
  console.error(`\nWrangler-Konfiguration: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

const anzahl = Object.keys(config.env.beta.vars).length;
console.log("Wrangler-Konfiguration: striktes JSON, Konto festgeschrieben, "
  + `beide Umgebungen mit ${anzahl} gleichen Variablen, SUPABASE_URL passend zum Ziel der Edge-Funktionen.`);
