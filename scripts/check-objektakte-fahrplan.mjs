#!/usr/bin/env node
// Bewacht, dass der Fahrplan der Objektakte vollstaendig bleibt.
//
// WIE DAS AUFKAM
//
// Sebastian hat am 12.10.2026 gefragt, ob es die ganzen Sachen im System
// wirklich braucht und wie der normale Ablauf aussieht. Die ehrliche Antwort:
// ein Hausverkauf erzeugt sieben eigenstaendige Akten, und wer allein
// arbeitet, musste sieben Listen oeffnen, um zu sehen, wo ein Objekt steht.
// Daraus wurde der Fahrplan in app/lib/objektakte-fahrplan.ts.
//
// Ein Fahrplan, der eine Station vergisst, ist schlimmer als keiner: er sieht
// vollstaendig aus. Genau dieser Fehler ist am 08.10.2026 schon einmal
// passiert, als der Aufmassauftrag in keiner Agenda stand und die Kategorie
// "Wiedervorlage Verkaufsprojekt" aus einer Spalte las, die niemand
// beschreibt. Beides fiel nicht auf, weil nichts fehlte -- es war nur nichts
// da.
//
// WAS GEPRUEFT WIRD
//
// 1. Jeder Vorgang aus VORGAENGE (app/lib/objektakte-navigation.ts) hat eine
//    Station im Fahrplan. Wer einen siebten Vorgang anlegt, muss entscheiden,
//    wo im Ablauf er steht.
// 2. Jede Station nennt entweder einen Vorgang, den es gibt, oder bewusst
//    keinen.
// 3. Jede Station hat eine Auswertung und einen Weg zum Anlegen -- auch wenn
//    der null ist. Eine Station ohne Auswertung waere eine leere Zeile.
// 4. Schluessel und Beschriftungen sind eindeutig, und jede Station sagt in
//    einem Satz, was der Schritt im Geschaeft bedeutet.
//
// Was sie NICHT leisten kann: ob die Reihenfolge der Stationen dem Ablauf
// eines Verkaufs entspricht. Das ist eine fachliche Entscheidung und steht
// als Begruendung im Modul.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFile(path.join(WURZEL, p), "utf8").then((t) => t.replace(/\r\n/g, "\n"));

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const fahrplan = await lies("app/lib/objektakte-fahrplan.ts");
const navigation = await lies("app/lib/objektakte-navigation.ts");

// --- Die Stationen aus dem Modul lesen ----------------------------------

const stationenBlock = /export const STATIONEN: Station\[\] = \[([\s\S]*?)\n\];/.exec(fahrplan);
pruefe(Boolean(stationenBlock),
  "In app/lib/objektakte-fahrplan.ts liess sich STATIONEN nicht lesen.\n"
  + "  Entweder ist die Liste weg, oder ihre Form hat sich geaendert.");
if (!stationenBlock) { ausgeben(); process.exit(1); }

const stationen = [...stationenBlock[1].matchAll(
  /\{\s*schluessel:\s*"([a-z_]+)",\s*beschriftung:\s*"([^"]+)",\s*bedeutung:\s*"([^"]+)",\s*freiwillig:\s*(true|false),\s*vorgang:\s*(?:"([^"]+)"|null),\s*\}/g,
)].map((m) => ({
  schluessel: m[1], beschriftung: m[2], bedeutung: m[3],
  freiwillig: m[4] === "true", vorgang: m[5] ?? null,
}));

pruefe(stationen.length > 0,
  "Aus STATIONEN liess sich keine einzige Station lesen.\n"
  + "  Die Eintraege muessen die Felder schluessel, beschriftung, bedeutung,\n"
  + "  freiwillig und vorgang in dieser Reihenfolge tragen.");

// --- Die Vorgaenge aus der Navigation lesen ------------------------------

const vorgaenge = [...navigation.matchAll(/\{\s*beschriftung:\s*"([^"]+)",\s*liste:\s*"([^"]+)"\s*\}/g)]
  .map((m) => m[1]);
pruefe(vorgaenge.length > 0,
  "In app/lib/objektakte-navigation.ts liess sich VORGAENGE nicht lesen.");

// --- 1. Kein Vorgang ohne Station ---------------------------------------

for (const vorgang of vorgaenge) {
  pruefe(stationen.some((s) => s.vorgang === vorgang),
    `Der Vorgang "${vorgang}" steht in VORGAENGE, aber in keiner Station des\n`
    + "  Fahrplans. Die Objektakte verlinkt ihn damit in der Vorgangszeile,\n"
    + "  zeigt aber nicht, ob es ihn zu diesem Objekt gibt und wie weit er ist.\n"
    + "  Trage ihn in app/lib/objektakte-fahrplan.ts an der Stelle ein, an der\n"
    + "  er im Ablauf eines Verkaufs vorkommt.");
}

// --- 2. Keine Station ohne gueltigen Vorgang ----------------------------

for (const station of stationen) {
  if (station.vorgang === null) continue;
  pruefe(vorgaenge.includes(station.vorgang),
    `Die Station "${station.beschriftung}" nennt den Vorgang\n`
    + `  "${station.vorgang}", den es in VORGAENGE nicht gibt. Die Zeile fuehrt\n`
    + "  damit ins Leere.");
}

// --- 3. Jede Station hat Auswertung und Weg zum Anlegen -----------------

const auswertungBlock = /const auswertung: Record<string, Auswertung> = \{([\s\S]*?)\n  \};/.exec(fahrplan);
const anlegenBlock = /const anlegenWege: Record<string, \{ pfad: string; vorbelegt: boolean \} \| null> = \{([\s\S]*?)\n  \};/.exec(fahrplan);
pruefe(Boolean(auswertungBlock), "Der Block `auswertung` liess sich nicht lesen.");
pruefe(Boolean(anlegenBlock), "Der Block `anlegenWege` liess sich nicht lesen.");

for (const station of stationen) {
  if (auswertungBlock) {
    pruefe(new RegExp(`\\n\\s{4}${station.schluessel}:\\s*\\(\\(\\)`).test(auswertungBlock[1]),
      `Die Station "${station.beschriftung}" (${station.schluessel}) hat keine Auswertung.\n`
      + "  Sie waere eine Zeile ohne Stand und ohne Text.");
  }
  if (anlegenBlock) {
    pruefe(new RegExp(`\\n\\s{4}${station.schluessel}:`).test(anlegenBlock[1]),
      `Die Station "${station.beschriftung}" (${station.schluessel}) steht nicht in\n`
      + "  anlegenWege. Auch \"hier wird nichts angelegt\" muss dort als null stehen,\n"
      + "  damit die Entscheidung sichtbar ist und nicht vergessen wirkt.");
  }
}

// --- 4. Eindeutig und erklaert ------------------------------------------

const doppelt = (werte) => werte.filter((w, i) => werte.indexOf(w) !== i);
for (const wert of doppelt(stationen.map((s) => s.schluessel))) {
  pruefe(false, `Der Stationsschluessel "${wert}" kommt mehrfach vor.`);
}
for (const wert of doppelt(stationen.map((s) => s.beschriftung))) {
  pruefe(false, `Die Stationsbeschriftung "${wert}" kommt mehrfach vor.`);
}
for (const station of stationen) {
  pruefe(station.bedeutung.length >= 25 && /[.!?]$/.test(station.bedeutung),
    `Die Station "${station.beschriftung}" erklaert in \`bedeutung\` nicht, was der\n`
    + `  Schritt im Geschaeft bedeutet ("${station.bedeutung}"). Ein ganzer Satz,\n`
    + "  der einem Neuen den Schritt erklaert -- nicht die Bedienung des Formulars.");
}

// --- 5. Die Karten, die der Fahrplan ersetzt, sind wirklich weg ---------

const akte = await lies("app/routes/property-detail.tsx");
for (const id of ["verkaufsprojekt", "maklerauftrag"]) {
  pruefe(!akte.includes(`id="${id}"`),
    `In app/routes/property-detail.tsx steht noch eine Karte mit id="${id}".\n`
    + "  Der Fahrplan zeigt diese Station bereits; zweimal dasselbe auf einer\n"
    + "  Seite ist genau die Unuebersichtlichkeit, gegen die er gebaut wurde.");
}
pruefe(akte.includes("<ObjektakteFahrplan"),
  "app/routes/property-detail.tsx setzt den Fahrplan nicht ein.");

// --- Ergebnis -----------------------------------------------------------

function ausgeben() {
  if (fehler.length > 0) {
    console.error(`\nObjektakte-Fahrplan: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
    for (const f of fehler) console.error(`- ${f}\n`);
  }
}

ausgeben();
if (fehler.length > 0) process.exit(1);

const pflicht = stationen.filter((s) => !s.freiwillig).length;
console.log(`Objektakte-Fahrplan: ${stationen.length} Stationen (${pflicht} Pflicht, `
  + `${stationen.length - pflicht} freiwillig), alle ${vorgaenge.length} Vorgaenge der Objektakte vertreten.`);
