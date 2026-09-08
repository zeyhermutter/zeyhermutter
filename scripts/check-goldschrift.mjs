#!/usr/bin/env node
// Prueft die eine Regel, die im Kopf von app/public-website.css steht:
//
//   Gold traegt keinen Text auf hellem Grund.
//
// #C09A5B auf dem Elfenbein #FAF8F4 ergibt ein Kontrastverhaeltnis von 2,47:1.
// Lesbar ist ab 4,5:1 (WCAG AA, normale Schriftgroesse). Auf dem Navy #062037
// ergibt dasselbe Gold 6,31:1 und traegt Text muehelos.
//
// Ein Kommentar haelt niemanden auf. Dieser Pruefer schon: er sucht jede
// Regel, die Schrift auf Gold setzt, und verlangt, dass sie in einem Bereich
// mit Navy-Grund steht.
//
// Die Liste der Navy-Bereiche wird NICHT von Hand gepflegt, sondern aus dem
// Blatt selbst gelesen: jeder Selektor, dessen Block "background: var(--zm-navy)"
// setzt, gilt als Navy-Bereich. Eine von Hand getippte Liste veraltet still.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const wurzel = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const blatt = path.join(wurzel, "app/public-website.css");

const GOLD = "#C09A5B";
const NAVY = "#062037";
const HELL = ["#FAF8F4", "#FFFFFF", "#F2EEE6"];

function kanal(v) { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }
function leuchtdichte(hex) {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
}
function verhaeltnis(a, b) {
  const [h, d] = [leuchtdichte(a), leuchtdichte(b)].sort((x, y) => y - x);
  return (h + 0.05) / (d + 0.05);
}

const roh = fs.readFileSync(blatt, "utf8");
// Kommentare entfernen, damit Beispiele im Fliesstext nicht als Regel zaehlen.
const css = roh.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));

// Regelbloecke einsammeln. Verschachtelte @media-Bloecke werden mitgenommen,
// indem nur auf Bloecke ohne "{" im Rumpf geachtet wird.
const bloecke = [];
for (const treffer of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
  const selektor = treffer[1].trim().replace(/\s+/g, " ");
  if (!selektor || selektor.startsWith("@")) continue;
  const zeile = css.slice(0, treffer.index).split("\n").length;
  bloecke.push({ selektor, rumpf: treffer[2], zeile });
}

// 1. Navy-Bereiche aus dem Blatt ableiten.
const navyBereiche = new Set();
for (const b of bloecke) {
  if (/background(-color)?\s*:\s*var\(--zm-navy\)/.test(b.rumpf) || new RegExp(NAVY, "i").test(b.rumpf)) {
    for (const einzeln of b.selektor.split(",")) {
      const s = einzeln.trim().replace(/:{1,2}[a-z-]+(\([^)]*\))?/g, "").trim();
      if (s) navyBereiche.add(s);
    }
  }
}
// Die Auszeichnungsklasse fuer "dieser Abschnitt steht auf Navy".
navyBereiche.add(".zm-auf-navy");

function stehtAufNavy(selektor, rumpf) {
  // a) Der Block faerbt seinen eigenen Grund navy.
  if (/background(-color)?\s*:\s*var\(--zm-navy\)/.test(rumpf)) return true;
  if (new RegExp(NAVY, "i").test(rumpf)) return true;
  // b) Der Selektor liegt in einem bekannten Navy-Bereich.
  for (const bereich of navyBereiche) {
    if (selektor === bereich) return true;
    if (selektor.startsWith(bereich + " ") || selektor.startsWith(bereich + ".") ||
        selektor.startsWith(bereich + ":") || selektor.startsWith(bereich + ">")) return true;
  }
  return false;
}

// 2. Jede Regel pruefen, die Schrift auf Gold setzt.
const verstoesse = [];
for (const b of bloecke) {
  const setztGold = /(^|[;{\s])color\s*:\s*var\(--zm-gold\)\s*[;}]?/.test(b.rumpf) ||
                    new RegExp(`(^|[;{\\s])color\\s*:\\s*${GOLD}`, "i").test(b.rumpf);
  if (!setztGold) continue;
  for (const einzeln of b.selektor.split(",")) {
    const s = einzeln.trim();
    if (!s) continue;
    if (!stehtAufNavy(s, b.rumpf)) verstoesse.push({ selektor: s, zeile: b.zeile });
  }
}

const aufHell = HELL.map((h) => `${h}: ${verhaeltnis(GOLD, h).toFixed(2)}:1`).join(", ");
const aufNavy = verhaeltnis(GOLD, NAVY).toFixed(2);

if (verstoesse.length) {
  console.error(`\nGoldene Schrift auf hellem Grund gefunden (${verstoesse.length}):\n`);
  for (const v of verstoesse) console.error(`  ${blatt.replace(wurzel + "/", "")}:${v.zeile}  ${v.selektor}`);
  console.error(`\n${GOLD} erreicht auf den hellen Flaechen nur ${aufHell} — noetig sind 4,5:1.`);
  console.error(`Auf ${NAVY} sind es ${aufNavy}:1. Fuer goldene Schrift auf Hell gibt es --zm-gold-tief.\n`);
  process.exit(1);
}

console.log(`Goldschrift: ${bloecke.length} Regeln geprueft, ${navyBereiche.size} Navy-Bereiche erkannt, keine goldene Schrift auf hellem Grund.`);
console.log(`  ${GOLD} auf Navy ${aufNavy}:1 — auf Hell ${aufHell}.`);
