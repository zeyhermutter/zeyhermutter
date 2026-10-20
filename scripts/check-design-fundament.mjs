#!/usr/bin/env node
// Visuelles Fundament (Paket C, ab 19.10.2026) -- eine Sperrklinke.
//
// Gemessen am 19.10.2026 im Programm (ohne oeffentliche Website):
// Hunderte Hex-Farben, ein dunkles Grundthema, das ein helles Thema mit
// "!important" ueberschreibt, und Dutzende Schriftgroessen. Das wird
// schrittweise abgebaut (Farben als Rollen in app/styles.css, Dunkelbasis
// abbauen, Schriftstufen). Diese Pruefung haelt jeden erreichten Stand fest:
// die Zahlen duerfen sinken, aber nicht wieder steigen. Wer sie senkt,
// traegt den neuen Stand unten ein.
//
// Gezaehlt wird in app/*.css ohne die Dateien der oeffentlichen Website;
// die Token-Definitionen in :root von app/styles.css zaehlen nicht mit.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OEFFENTLICH = new Set(["public-website.css", "homepage-v7-realtor.css", "homepage-variants.css", "homepage-variants-image.css", "brand-logo.css"]);

// Erreichter Stand. Nur nach unten aendern.
//
// Lehre vom 19.10.2026: Alle 284 "!important" des hellen Themas auf einmal zu
// entfernen, hat der Stil-Fingerabdruck (scripts/stil-fingerabdruck.browser.js)
// auf 35 Seiten mit 225 Abweichungen beantwortet -- darunter unlesbare
// Kartenmarker und ein dunkles Feld in der Lead-Akte. Grund: die dunklen
// Grundregeln sind oft spezifischer oder selbst "!important". Deshalb erst die
// dunkle Grundregel auf den hellen Wert setzen, dann das "!important" der
// passenden hellen Regel entfernen -- Datei fuer Datei, mit Fingerabdruck.
// 20.10.2026 (Schritt 2a/2b): Regeln, deren Klassen in keiner .ts/.tsx-Datei
// mehr vorkommen (auch nicht als Vorlage "praefix-${...}" oder als
// Status-Wert), mit einem echten CSS-Parser (postcss) entfernt -- 56 im hellen
// Thema, 337 in den uebrigen Dateien, dazu properties-workflow.css und
// lead-object-state.css (nirgends eingebunden). Fingerabdruck vorher/nachher.
const HOECHSTENS = { hex: 1042, important: 249, schriftgroessen: 36 };

const ROLLEN = ["grund", "flaeche", "text", "text-2", "text-leise", "text-blass", "linie", "linie-leise", "linie-feld", "handlung", "auf-dunkel", "verweis", "fehler", "gut"];

const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
let hex = 0, important = 0;
const groessen = new Set();
const fehler = [];
for (const datei of (await readdir(path.join(WURZEL, "app"))).filter((n) => n.endsWith(".css") && !OEFFENTLICH.has(n))) {
  let text = ohneKommentare((await readFile(path.join(WURZEL, "app", datei), "utf8")).replace(/\r\n/g, "\n"));
  if (datei === "styles.css") text = text.replace(/--crm-(farbe|schrift)-[a-z0-9-]+\s*:[^;]*;/g, "");
  hex += (text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
  important += (text.match(/!important/g) ?? []).length;
  // Die Stufen selbst (var(--crm-schrift-..)) zaehlen nicht -- sie sind das Ziel.
  for (const m of text.matchAll(/font-size\s*:\s*([^;}!]+)/g)) if (!/^var\(--crm-schrift-/.test(m[1].trim())) groessen.add(m[1].trim());
}

const styles = (await readFile(path.join(WURZEL, "app/styles.css"), "utf8"));
for (const r of ROLLEN) if (!new RegExp(`--crm-farbe-${r}:`).test(styles)) fehler.push(`app/styles.css: Farbrolle --crm-farbe-${r} fehlt`);
if (hex > HOECHSTENS.hex) fehler.push(`${hex} Hex-Farben in den Stylesheets, erreicht waren ${HOECHSTENS.hex} -- neue Farben als Rolle (var(--crm-farbe-...)) schreiben`);
if (important > HOECHSTENS.important) fehler.push(`${important}x !important, erreicht waren ${HOECHSTENS.important} -- kein neues !important`);
if (groessen.size > HOECHSTENS.schriftgroessen) fehler.push(`${groessen.size} verschiedene Schriftgroessen, erreicht waren ${HOECHSTENS.schriftgroessen} -- eine Stufe var(--crm-schrift-..) nehmen`);

if (fehler.length) {
  console.error("\nDesign-Fundament:\n  " + fehler.join("\n  ") + "\n");
  process.exit(1);
}
console.log(`Design-Fundament: ${ROLLEN.length} Farbrollen definiert; ${hex} Hex-Farben (hoechstens ${HOECHSTENS.hex}), ${important}x !important (hoechstens ${HOECHSTENS.important}), ${groessen.size} Schriftgroessen (hoechstens ${HOECHSTENS.schriftgroessen}).`);
