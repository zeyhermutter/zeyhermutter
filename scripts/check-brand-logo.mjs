import { readFile } from "node:fs/promises";

// Geprueft wird das Logo, das tatsaechlich ausgeliefert wird: der Pfad wird
// aus app/components/public-shell.tsx gelesen, nicht hier eingetippt.
//
// Diese Pruefung hat schon zweimal etwas gefangen, das sonst live gegangen
// waere. Beim ersten Mal sah sie sich Dateien an, die niemand importierte, und
// war deshalb gruen, ohne das ausgelieferte Bild je anzufassen. Beim zweiten
// Mal stand die Farbpruefung hinter einer Bedingung, die nie zutraf. Beide
// Male war das Ergebnis dasselbe: eine Pruefung, die nur "in Ordnung" sagt.
//
// Deshalb hier keine bedingten Zweige. Jede Zusicherung wird ausgefuehrt, und
// wenn eine Angabe fehlt, ist das ein Fehler und kein Grund zu ueberspringen.

const WURZEL = new URL("..", import.meta.url);
const SHELL = new URL("app/components/public-shell.tsx", WURZEL);
const BLATT = new URL("app/public-website.css", WURZEL);

const ERWARTETE_BREITE = 565;
const ERWARTETE_HOEHE = 166;

// Die drei Markenfarben. Mehr darf in der Datei nicht vorkommen: eine vierte
// Farbe waere entweder ein Rest der Rastervorlage oder eine stille Aenderung
// an der Marke.
const MARKENFARBEN = ["#062037", "#c09a5b", "#ecebf0"];

function fehler(text) {
  console.error(`\nMarkenlogo: ${text}\n`);
  process.exit(1);
}

const shell = await readFile(SHELL, "utf8");

const pfadTreffer = shell.match(/const LOGO = "([^"]+)"/);
if (!pfadTreffer) fehler('In public-shell.tsx steht kein `const LOGO = "..."`.');
const oeffentlicherPfad = pfadTreffer[1];
if (!oeffentlicherPfad.startsWith("/")) fehler(`Der Logopfad "${oeffentlicherPfad}" ist nicht absolut.`);
if (!oeffentlicherPfad.endsWith(".svg")) fehler(`Erwartet wird eine Vektordatei, angegeben ist "${oeffentlicherPfad}".`);

// Die Masse im Markup muessen zur Datei passen, sonst springt das Bild beim
// Laden (der Browser reserviert sonst den falschen Platz).
const breiteTreffer = shell.match(/const LOGO_BREITE = (\d+)/);
const hoeheTreffer = shell.match(/const LOGO_HOEHE = (\d+)/);
if (!breiteTreffer || !hoeheTreffer) fehler("In public-shell.tsx fehlen LOGO_BREITE oder LOGO_HOEHE.");

const datei = new URL(`public${oeffentlicherPfad}`, WURZEL);
let svg;
try {
  svg = await readFile(datei, "utf8");
} catch {
  fehler(`Die Datei public${oeffentlicherPfad} fehlt, obwohl public-shell.tsx sie ausliefert.`);
}

// --- Masse -----------------------------------------------------------------
const viewBox = svg.match(/viewBox="([^"]+)"/);
if (!viewBox) fehler("Die Datei hat keine viewBox. Ohne sie skaliert sie nicht.");
const masse = viewBox[1].trim().split(/[\s,]+/).map(Number);
if (masse.length !== 4 || masse.some((z) => !Number.isFinite(z))) fehler(`Unlesbare viewBox: "${viewBox[1]}".`);
const [, , breite, hoehe] = masse;
if (breite !== ERWARTETE_BREITE || hoehe !== ERWARTETE_HOEHE) {
  fehler(`Die viewBox ist ${breite}x${hoehe}, erwartet ${ERWARTETE_BREITE}x${ERWARTETE_HOEHE}.`);
}
if (Number(breiteTreffer[1]) !== breite || Number(hoeheTreffer[1]) !== hoehe) {
  fehler(`public-shell.tsx gibt ${breiteTreffer[1]}x${hoeheTreffer[1]} an, die Datei ist ${breite}x${hoehe}. `
       + "Beim Laden wuerde der Kopfbereich springen.");
}

// --- Inhalt ----------------------------------------------------------------
const pfade = (svg.match(/<path\b/g) ?? []).length;
if (pfade < 5) fehler(`Die Datei enthaelt nur ${pfade} Pfade. Das ist zu wenig fuer dieses Logo — vermutlich ist die Nachzeichnung fehlgeschlagen.`);

if (/<image\b/.test(svg)) fehler("Die Datei enthaelt ein eingebettetes Rasterbild. Dann ist sie nur eine Huelle um ein Pixelbild und skaliert nicht.");
if (/<text\b/.test(svg)) fehler("Die Datei enthaelt ein <text>-Element. Der Schriftzug haengt dann von einer Schrift ab, die der Browser nicht hat.");

// --- Farben ----------------------------------------------------------------
const gefunden = [...new Set((svg.match(/#[0-9A-Fa-f]{3,8}\b/g) ?? []).map((f) => f.toLowerCase()))].sort();
const fremd = gefunden.filter((f) => !MARKENFARBEN.includes(f));
if (fremd.length) fehler(`Fremde Farben in der Logodatei: ${fremd.join(", ")}. Erlaubt sind nur ${MARKENFARBEN.join(", ")}.`);
const fehlend = MARKENFARBEN.filter((f) => !gefunden.includes(f));
if (fehlend.length) fehler(`In der Logodatei fehlen Markenfarben: ${fehlend.join(", ")}.`);

// --- Der Grund muss exakt die Farbe des Kopfbereichs sein -------------------
// Weicht er ab, steht im Kopf ein sichtbares Rechteck um das Logo.
const blatt = await readFile(BLATT, "utf8");
const navyTreffer = blatt.match(/--zm-navy:\s*(#[0-9A-Fa-f]{6})/);
if (!navyTreffer) fehler("In app/public-website.css ist --zm-navy nicht zu finden.");
const navy = navyTreffer[1].toLowerCase();

const grundTreffer = svg.match(/<rect[^>]*fill="(#[0-9A-Fa-f]{6})"[^>]*>/i) ?? svg.match(/<path[^>]*fill="(#[0-9A-Fa-f]{6})"[^>]*d="M0 0h\d+v\d+H0z"/i);
if (!grundTreffer) fehler("Die Logodatei hat keine durchgehende Grundflaeche. Auf dem Navy des Kopfbereichs waere das Ergebnis unvorhersehbar.");
if (grundTreffer[1].toLowerCase() !== navy) {
  fehler(`Der Grund der Logodatei ist ${grundTreffer[1]}, der Kopfbereich ist ${navy}. `
       + "Die Kante des Bildes waere als Rechteck sichtbar.");
}

const kb = (Buffer.byteLength(svg) / 1024).toFixed(1);
console.log(`Markenlogo: public${oeffentlicherPfad} — ${breite}x${hoehe}, ${pfade} Pfade, ${kb} KB, Grund ${navy} wie im Kopfbereich.`);
