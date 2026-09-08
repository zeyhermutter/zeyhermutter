#!/usr/bin/env node
// Bewacht Sitemap und robots.txt gegen die Route, an die niemand gedacht hat.
//
// WAS HIER SCHIEFGING
//
// Die Sitemap trug vier von Hand getippte Pfade. Dazwischen sind elf
// oeffentliche Seiten entstanden -- Bewertung, Suchauftrag, Referenzen, Ueber
// uns, Widerruf, Ohne Makler verkaufen, der Ratgeber und seine vier
// Anlassseiten. Keine davon stand darin. Ausgerechnet die Anlassseiten sind
// die, wegen derer jemand ueberhaupt sucht.
//
// robots.txt hatte denselben Fehler von der anderen Seite: die Sperrliste war
// bei /crm, /leads und /properties stehengeblieben, waehrend /mandates,
// /closings, /commissions und ein Dutzend weitere interne Bereiche
// dazugekommen sind.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// app/routes.ts ist die Wahrheit. Jede Route darin muss in genau einer der
// Listen in app/lib/public-pages.ts vorkommen:
//
//   - in der Sitemap (fest, aus dem CMS oder aus der Datenbank),
//   - in NICHT_IN_DIE_SITEMAP, mit Begruendung,
//   - oder im internen Bereich, den robots.txt sperrt.
//
// Wer eine oeffentliche Seite anlegt und die Sitemap vergisst, bekommt beim
// Build eine Fehlermeldung statt einer Seite, die Google nie findet.
//
// Umgekehrt gilt es auch: eine Liste darf keine Pfade nennen, die es nicht
// mehr gibt. Eine Sitemap mit toten Adressen ist schlechter als eine kurze.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = async (rel) => (await readFile(path.join(WURZEL, rel), "utf8")).replace(/\r\n/g, "\n");

const routen = await lies("app/routes.ts");
const seiten = await lies("app/lib/public-pages.ts");
const inhalte = await lies("app/lib/website-content.ts");

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

// --- app/routes.ts auslesen ------------------------------------------------
//
// Der interne Bereich haengt in layout("routes/internal-layout.tsx", [ ... ]).
// Alles darin ist intern, alles ausserhalb oeffentlich erreichbar.

const layoutStart = routen.indexOf('layout("routes/internal-layout.tsx"');
pruefe(layoutStart >= 0, "In app/routes.ts fehlt layout(\"routes/internal-layout.tsx\") -- diese Pruefung kann intern und oeffentlich nicht mehr trennen.");

let tiefe = 0, layoutEnde = -1;
for (let i = layoutStart; i >= 0 && i < routen.length; i += 1) {
  if (routen[i] === "[") tiefe += 1;
  else if (routen[i] === "]") { tiefe -= 1; if (tiefe === 0) { layoutEnde = i; break; } }
}
pruefe(layoutEnde > layoutStart, "Der interne Layout-Block in app/routes.ts liess sich nicht abgrenzen.");

const alsPfad = (roh) => (roh.startsWith("/") ? roh : `/${roh}`);
const oeffentlich = new Set(), intern = new Set();
for (const treffer of routen.matchAll(/route\(\s*"([^"]+)"/g)) {
  const stelle = treffer.index ?? 0;
  const ziel = stelle > layoutStart && stelle < layoutEnde ? intern : oeffentlich;
  ziel.add(alsPfad(treffer[1]));
}
pruefe(/\bindex\("routes\/home\.tsx"\)/.test(routen), "app/routes.ts hat keine index-Route auf routes/home.tsx.");
oeffentlich.add("/");

pruefe(oeffentlich.size > 20, `Aus app/routes.ts wurden nur ${oeffentlich.size} oeffentliche Routen gelesen. Das Format hat sich vermutlich geaendert.`);
pruefe(intern.size > 40, `Aus app/routes.ts wurden nur ${intern.size} interne Routen gelesen. Das Format hat sich vermutlich geaendert.`);

// --- die Listen auslesen ---------------------------------------------------

function listeLesen(quelle, name) {
  const block = quelle.match(new RegExp(`${name}[^=]*=\\s*\\[([\\s\\S]*?)\\]`));
  if (!block) { fehler.push(`In app/lib/public-pages.ts fehlt ${name}.`); return []; }
  return [...block[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

const ohneCms = listeLesen(seiten, "SEITEN_OHNE_CMS");
const internePraefixe = listeLesen(seiten, "INTERNE_PRAEFIXE");
const weitereGesperrt = listeLesen(seiten, "WEITERE_GESPERRTE_PFADE");

const ausnahmenBlock = seiten.match(/NICHT_IN_DIE_SITEMAP[^=]*=\s*\{([\s\S]*?)\n\};/);
if (!ausnahmenBlock) fehler.push("In app/lib/public-pages.ts fehlt NICHT_IN_DIE_SITEMAP.");
const ausnahmen = new Map();
for (const [, pfad, grund] of (ausnahmenBlock?.[1] ?? "").matchAll(/"([^"]+)"\s*:\s*"([^"]*)"/g)) {
  ausnahmen.set(pfad, grund.trim());
}

// Die CMS-Seiten und ihre Pfade.
const cmsPfade = new Set([...inhalte.matchAll(/path:\s*"([^"]+)"/g)].map((m) => m[1]));
pruefe(cmsPfade.size >= 12, `Aus app/lib/website-content.ts wurden nur ${cmsPfade.size} CMS-Pfade gelesen.`);

// --- 1. Jede oeffentliche Route ist irgendwo erfasst -----------------------

const inDerSitemap = new Set([...ohneCms, ...cmsPfade, "/"]);
const nichtErfasst = [...oeffentlich].filter((pfad) => !inDerSitemap.has(pfad) && !ausnahmen.has(pfad));
pruefe(nichtErfasst.length === 0,
  `Diese oeffentlichen Routen stehen in keiner Liste:\n${nichtErfasst.map((p) => `    ${p}`).join("\n")}\n`
  + "  Entweder gehoeren sie in die Sitemap (SEITEN_OHNE_CMS oder ins CMS),\n"
  + "  oder mit Begruendung in NICHT_IN_DIE_SITEMAP -- app/lib/public-pages.ts.");

// --- 2. Jede Ausnahme hat eine Begruendung und einen Grund zu bestehen -----

for (const [pfad, grund] of ausnahmen) {
  pruefe(grund.length >= 10, `Die Ausnahme "${pfad}" in NICHT_IN_DIE_SITEMAP hat keine brauchbare Begruendung ("${grund}").`);
  pruefe(oeffentlich.has(pfad),
    `NICHT_IN_DIE_SITEMAP nennt "${pfad}", aber app/routes.ts kennt diese Route nicht mehr.`);
}
for (const pfad of ohneCms) {
  pruefe(oeffentlich.has(pfad),
    `SEITEN_OHNE_CMS nennt "${pfad}", aber app/routes.ts kennt diese Route nicht.\n`
    + "  Die Sitemap wuerde eine Adresse melden, die ins Leere fuehrt.");
}

// --- 3. robots.txt sperrt jeden internen Bereich ---------------------------

const gesperrt = [...internePraefixe, ...weitereGesperrt];
const offen = [...intern].filter((pfad) => !gesperrt.some((praefix) => pfad === praefix || pfad.startsWith(`${praefix}/`)));
pruefe(offen.length === 0,
  `Diese internen Routen sperrt robots.txt nicht:\n${[...new Set(offen.map((p) => `/${p.split("/")[1]}`))].map((p) => `    ${p}`).join("\n")}\n`
  + "  Fehlende Praefixe gehoeren in INTERNE_PRAEFIXE -- app/lib/public-pages.ts.");

for (const praefix of internePraefixe) {
  pruefe([...intern].some((pfad) => pfad === praefix || pfad.startsWith(`${praefix}/`)),
    `INTERNE_PRAEFIXE nennt "${praefix}", aber im internen Bereich gibt es keine solche Route mehr.`);
}

// --- 4. robots.txt und die Sitemap widersprechen sich nicht ----------------

const gesperrtUndGemeldet = [...inDerSitemap].filter((pfad) =>
  gesperrt.some((praefix) => pfad === praefix || pfad.startsWith(praefix.endsWith("/") ? praefix : `${praefix}/`)));
pruefe(gesperrtUndGemeldet.length === 0,
  `Diese Pfade stehen in der Sitemap und sind zugleich in robots.txt gesperrt:\n`
  + `${gesperrtUndGemeldet.map((p) => `    ${p}`).join("\n")}\n`
  + "  Eine Sitemap, die gesperrte Adressen meldet, ist ein Fehler in der Search Console.");

if (fehler.length > 0) {
  console.error(`\nSitemap: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Sitemap: ${oeffentlich.size} oeffentliche Routen geprueft, ${ausnahmen.size} davon begruendet `
  + `ausgenommen; gemeldet werden ${inDerSitemap.size} feste Pfade plus die Objektseiten aus der `
  + `Datenbank. ${intern.size} interne Routen von ${internePraefixe.length} Praefixen gesperrt.`);
