#!/usr/bin/env node
// Bewacht den Seitenkopf der oeffentlichen Webseite: kanonische Adresse und
// Vorschau fuer geteilte Links.
//
// WAS HIER FEHLTE
//
// Keine oeffentliche Seite trug Open-Graph-Angaben. Ein weitergeleiteter Link
// auf ein Expose kam beim Empfaenger als nackte Adresse an, ohne Bild. Die
// kanonische Adresse stand auf vier von fuenfzehn Seiten.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// 1. Jede oeffentliche Seite -- abgeleitet aus app/routes.ts, nicht aus einer
//    Liste hier -- reicht ihre Meta-Angaben durch seitenkopf().
// 2. Das Vorschaubild existiert, ist ein JPEG in 1200 x 630 und nicht zu gross.
// 3. root.tsx liefert die Herkunft, ohne die keine absolute Adresse entsteht.
// 4. Die strukturierte Angabe fuer Suchmaschinen behauptet nichts, was nicht
//    auf der Seite steht: keine Anschrift, kein Telefon, keine Oeffnungszeiten,
//    solange diese nirgends veroeffentlicht sind.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = async (rel) => (await readFile(path.join(WURZEL, rel), "utf8")).replace(/\r\n/g, "\n");

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

// --- 1. Jede oeffentliche Seite nutzt seitenkopf() ------------------------

const routen = await lies("app/routes.ts");
const seiten = await lies("app/lib/public-pages.ts");

const layoutStart = routen.indexOf('layout("routes/internal-layout.tsx"');
let tiefe = 0, layoutEnde = -1;
for (let i = layoutStart; i >= 0 && i < routen.length; i += 1) {
  if (routen[i] === "[") tiefe += 1;
  else if (routen[i] === "]") { tiefe -= 1; if (tiefe === 0) { layoutEnde = i; break; } }
}
pruefe(layoutStart >= 0 && layoutEnde > layoutStart, "Der interne Bereich in app/routes.ts liess sich nicht abgrenzen.");

// Ausgenommen ist, was keine Seite ist: die Eintraege aus NICHT_IN_DIE_SITEMAP --
// ausser den beiden dynamischen Seiten, die sehr wohl Seiten sind.
const ausnahmenBlock = seiten.match(/NICHT_IN_DIE_SITEMAP[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "";
const keineSeite = new Set([...ausnahmenBlock.matchAll(/"([^"]+)"\s*:/g)].map((m) => m[1]));
keineSeite.delete("/immobilien/:slug");
keineSeite.delete("/ratgeber/:thema");

const oeffentlicheDateien = new Map();
const home = routen.match(/\bindex\("([^"]+)"\)/);
if (home) oeffentlicheDateien.set("/", home[1]);
for (const treffer of routen.matchAll(/route\(\s*"([^"]+)"\s*,\s*"([^"]+)"/g)) {
  const stelle = treffer.index ?? 0;
  if (stelle > layoutStart && stelle < layoutEnde) continue;
  const pfad = `/${treffer[1]}`;
  if (keineSeite.has(pfad)) continue;
  oeffentlicheDateien.set(pfad, treffer[2]);
}
pruefe(oeffentlicheDateien.size >= 15, `Nur ${oeffentlicheDateien.size} oeffentliche Seiten aus app/routes.ts gelesen -- das Format hat sich vermutlich geaendert.`);

for (const [pfad, datei] of oeffentlicheDateien) {
  const text = (await lies(`app/${datei}`)).replace(/\r\n/g, "\n");
  const meta = text.match(/export function meta\(([^)]*)\)\s*\{([\s\S]*?)\n\}/);
  pruefe(meta && /seitenkopf\(/.test(meta[2]),
    `${pfad} (app/${datei}) reicht ihre Meta-Angaben nicht durch seitenkopf().\n`
    + "  Ohne das fehlen kanonische Adresse und Linkvorschau -- ein geteilter Link kommt als nackte Adresse an.");
}

// --- 2. Das Vorschaubild ---------------------------------------------------

const kopf = await lies("app/lib/seitenkopf.ts");
const bildAngabe = kopf.match(/TEILEN_BILD\s*=\s*\{\s*pfad:\s*"([^"]+)",\s*breite:\s*(\d+),\s*hoehe:\s*(\d+)/);
pruefe(bildAngabe, "In app/lib/seitenkopf.ts fehlt TEILEN_BILD.");

function jpegMasse(daten) {
  if (daten[0] !== 0xff || daten[1] !== 0xd8) return null;
  let i = 2;
  while (i < daten.length - 9) {
    if (daten[i] !== 0xff) return null;
    const marke = daten[i + 1];
    const laenge = daten.readUInt16BE(i + 2);
    if (marke >= 0xc0 && marke <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marke)) {
      return { hoehe: daten.readUInt16BE(i + 5), breite: daten.readUInt16BE(i + 7) };
    }
    i += 2 + laenge;
  }
  return null;
}

if (bildAngabe) {
  const [, pfad, breite, hoehe] = bildAngabe;
  let daten = null;
  try { daten = await readFile(path.join(WURZEL, "public", pfad.replace(/^\//, ""))); } catch { /* unten gemeldet */ }
  pruefe(daten, `Das Vorschaubild public${pfad} fehlt. Erzeugen mit: node scripts/erzeuge-teilen-bild.mjs`);
  if (daten) {
    const masse = jpegMasse(daten);
    pruefe(masse, `public${pfad} ist kein lesbares JPEG. WebP und SVG zeigen nicht alle Dienste als Vorschau an.`);
    if (masse) {
      pruefe(masse.breite === Number(breite) && masse.hoehe === Number(hoehe),
        `public${pfad} ist ${masse.breite} x ${masse.hoehe}, angegeben sind ${breite} x ${hoehe}.`);
      pruefe(masse.breite === 1200 && masse.hoehe === 630,
        `public${pfad} sollte 1200 x 630 gross sein -- das Format, das alle grossen Dienste erwarten.`);
    }
    pruefe(daten.length >= 20 * 1024 && daten.length <= 300 * 1024,
      `public${pfad} ist ${(daten.length / 1024).toFixed(0)} KB gross. Erwartet sind 20 bis 300 KB; manche Dienste laden groessere Vorschaubilder gar nicht.`);
  }
}

// --- 3. Die Herkunft kommt aus root.tsx -----------------------------------

const wurzel = await lies("app/root.tsx");
pruefe(/export function loader\([^)]*\)\s*\{[\s\S]*?origin:\s*new URL\(request\.url\)\.origin/.test(wurzel),
  "app/root.tsx liefert keine Herkunft mehr (loader mit origin).\n"
  + "  seitenkopf() gibt dann stillschweigend nichts aus -- keine kanonische Adresse, keine Vorschau.");

// --- 4. Die strukturierte Angabe behauptet nichts --------------------------

const org = kopf.match(/export function organisation[\s\S]*?\n\}/)?.[0] ?? "";
pruefe(org.includes('"@type": "RealEstateAgent"'), "app/lib/seitenkopf.ts enthaelt keine organisation() mehr.");
for (const feld of ["telephone", "address", "openingHours", "geo", "priceRange", "aggregateRating", "review"]) {
  pruefe(!new RegExp(`\\b${feld}\\s*:`).test(org),
    `organisation() behauptet "${feld}".\n`
    + "  Das steht nirgends auf der Webseite. Eine strukturierte Angabe, die der sichtbaren Seite\n"
    + "  vorgreift, wertet Google als Taeuschung. Erst ins Impressum, dann hierher -- und diese\n"
    + "  Pruefung entsprechend anpassen.");
}

if (fehler.length > 0) {
  console.error(`\nSeitenkopf: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Seitenkopf: ${oeffentlicheDateien.size} oeffentliche Seiten mit kanonischer Adresse und Linkvorschau, `
  + "Vorschaubild 1200 x 630, strukturierte Angabe ohne unbelegte Felder.");
