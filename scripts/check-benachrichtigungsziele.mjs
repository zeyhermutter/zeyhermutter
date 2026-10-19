#!/usr/bin/env node
// Bewacht, dass jede Benachrichtigung irgendwohin fuehrt -- und dass die
// Zuordnung nur an einer Stelle gepflegt wird.
//
// WIE DAS AUFKAM
//
// Am 08.10.2026 kam der Aufmassauftrag dazu. Die Edge-Funktion schrieb
// notifications.entity_type = 'MEASUREMENT_ORDER'. Die Zuordnung von Typ zu
// Weg stand zu dem Zeitpunkt zweimal im Code -- in app/routes/notifications.tsx
// und in app/components/notification-bell.tsx, Zeile fuer Zeile gleich -- und
// keine der beiden Kopien kannte den neuen Wert. Beide fielen auf "/crm"
// zurueck.
//
// Das ist die unangenehmste Art Fehler: nichts bricht. Die Benachrichtigung
// erscheint, man klickt, eine Seite oeffnet sich. Nur eben die falsche. Wer
// den Auftrag sucht, sucht ihn von Hand weiter.
//
// WAS GEPRUEFT WIRD
//
// 1. Die Zuordnung steht nur in app/lib/benachrichtigungsziele.ts. Keine
//    zweite Datei bildet entity_type auf einen Weg ab.
// 2. Jeder entity_type, den die Anwendung oder eine Edge-Funktion in die
//    Tabelle notifications schreibt, hat dort ein Ziel.
// 3. Jeder Weg in der Zuordnung fuehrt auf eine Route, die es gibt.
// 4. Die SQL-Seite schreibt entity_type positionsgebunden, also ohne
//    Spaltennamen -- maschinell nicht zuverlaessig auslesbar. Deshalb steht
//    die Zahl der Einfuegestellen unten als Zahl: kommt eine dazu, schlaegt
//    die Pruefung an und jemand sieht sich die Stelle an.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFile(path.join(WURZEL, p), "utf8").then((t) => t.replace(/\r\n/g, "\n"));

/**
 * Die Einfuegestellen in den Migrationen, mit dem Typ, den sie schreiben.
 * Von Hand gepflegt, weil der Wert dort positionsgebunden steht. Die Zahl
 * unten haelt die Liste ehrlich.
 */
// +8 durch die taegliche Automatik (P2-4): Lead-Wiedervorlage, Geldwaesche-Pruefung,
// Aufbewahrung, passende Suchprofile -- je einmal im ersten Lauf und im Nachtrag.
const SQL_EINFUEGESTELLEN = 16;
const SQL_TYPEN = ["CONTACT", "TASK", "LEAD", "PROPERTY_COMPLIANCE", "AUFBEWAHRUNG", "PROPERTY_INTERESTS"];

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const modul = await lies("app/lib/benachrichtigungsziele.ts");
const routen = await lies("app/routes.ts");

// --- 1. Die Zuordnung steht nur an einer Stelle -------------------------

async function alleDateien(verzeichnis) {
  const eintraege = await readdir(path.join(WURZEL, verzeichnis), { withFileTypes: true });
  const gefunden = [];
  for (const eintrag of eintraege) {
    const weg = `${verzeichnis}/${eintrag.name}`;
    if (eintrag.isDirectory()) gefunden.push(...await alleDateien(weg));
    else if (/\.(ts|tsx)$/.test(eintrag.name)) gefunden.push(weg);
  }
  return gefunden;
}

const quelldateien = await alleDateien("app");
for (const datei of quelldateien) {
  if (datei === "app/lib/benachrichtigungsziele.ts") continue;
  const inhalt = await lies(datei);
  pruefe(!/function\s+entityTarget\b/.test(inhalt),
    `${datei} definiert entityTarget selbst.\n`
    + "  Die Zuordnung von entity_type auf einen Weg steht in\n"
    + "  app/lib/benachrichtigungsziele.ts. Eine zweite Kopie veraltet still --\n"
    + "  genau so ist MEASUREMENT_ORDER am 08.10.2026 durchgefallen.");
  // Die Suche bildet Suchergebnisse ab, nicht Benachrichtigungen. Seit P2-2
  // (16.10.2026) steht sie in globale-suche.server.ts, die Trefferseite
  // crm-search.tsx nutzt sie. Die Ausnahmen stehen hier mit Namen, damit sie
  // nicht aus Versehen entstehen.
  if (datei === "app/routes/crm-search.tsx" || datei === "app/lib/globale-suche.server.ts") continue;
  pruefe(!/entity_type\s*===\s*"(CONTACT|LEAD|INQUIRY|SEARCH_PROFILE|VIEWING|PROPERTY|MEASUREMENT_ORDER)"/.test(inhalt),
    `${datei} vergleicht entity_type selbst mit Datensatzarten.\n`
    + "  Fuer das Ziel einer Benachrichtigung ist benachrichtigungsZiel()\n"
    + "  zustaendig; sonst entsteht wieder eine zweite Liste.");
}

// --- 2. Jeder geschriebene Typ hat ein Ziel -----------------------------

const zieleMitKennung = [...modul.matchAll(/^\s{2}([A-Z_]+):\s*\(id\)/gm)].map((m) => m[1]);
const zieleOhneKennung = [...modul.matchAll(/^\s{2}([A-Z_]+):\s*"/gm)].map((m) => m[1]);
const ziele = new Set([...zieleMitKennung, ...zieleOhneKennung]);
pruefe(ziele.size >= 8,
  `In app/lib/benachrichtigungsziele.ts liessen sich nur ${ziele.size} Ziele lesen.\n`
  + "  Entweder fehlen welche, oder die Form der Zuordnung hat sich geaendert\n"
  + "  und diese Pruefung liest ins Leere.");

const geschrieben = new Set(SQL_TYPEN);
const funktionen = await alleDateien("supabase/functions");
for (const datei of [...quelldateien, ...funktionen]) {
  const inhalt = await lies(datei);
  // Nur Stellen, die wirklich in notifications schreiben. audit_events hat
  // seine eigenen entity_type-Werte und gehoert nicht hierher.
  if (!/notifications"\)\.insert|into public\.notifications/.test(inhalt)) continue;
  for (const treffer of inhalt.matchAll(/entity_type\s*:\s*"([A-Z_]+)"/g)) geschrieben.add(treffer[1]);
}

for (const typ of geschrieben) {
  pruefe(ziele.has(typ),
    `Eine Benachrichtigung mit entity_type "${typ}" wird geschrieben, aber\n`
    + "  app/lib/benachrichtigungsziele.ts kennt dafuer kein Ziel. Der Klick\n"
    + "  landet auf /crm -- also nirgends. Bitte dort einen Weg ergaenzen.");
}

// --- 3. Jeder Weg fuehrt auf eine Route, die es gibt --------------------

for (const weg of [...modul.matchAll(/=>\s*`\/([a-z-]+)\//g)].map((m) => m[1])) {
  pruefe(new RegExp(`route\\("${weg}/`).test(routen) || new RegExp(`route\\("crm/${weg}`).test(routen),
    `Das Ziel /${weg}/… in app/lib/benachrichtigungsziele.ts hat in\n`
    + `  app/routes.ts keine Route. Der Klick endet auf einer leeren Seite.`);
}
for (const weg of [...modul.matchAll(/:\s*"(\/[a-z/-]+)"/g)].map((m) => m[1])) {
  pruefe(new RegExp(`route\\("${weg.replace(/^\//, "")}"`).test(routen),
    `Das Ziel ${weg} in app/lib/benachrichtigungsziele.ts hat in\n`
    + "  app/routes.ts keine Route.");
}

// --- 4. Die SQL-Einfuegestellen sind gezaehlt ---------------------------

let sqlStellen = 0;
const migrationen = await readdir(path.join(WURZEL, "supabase/migrations"));
for (const datei of migrationen.filter((d) => d.endsWith(".sql"))) {
  const inhalt = await lies(`supabase/migrations/${datei}`);
  sqlStellen += (inhalt.match(/insert into public\.notifications/g) ?? []).length;
}
pruefe(sqlStellen === SQL_EINFUEGESTELLEN,
  `Die Migrationen haben ${sqlStellen} Stellen, die in notifications einfuegen --\n`
  + `  erwartet waren ${SQL_EINFUEGESTELLEN}. In SQL steht entity_type positionsgebunden und\n`
  + "  ist maschinell nicht lesbar. Bitte die neue Stelle ansehen, ihren\n"
  + "  entity_type in SQL_TYPEN eintragen und die Zahl hier anpassen.");

// --- Ergebnis -----------------------------------------------------------

if (fehler.length > 0) {
  console.error(`\nBenachrichtigungsziele: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Benachrichtigungsziele: ${ziele.size} Ziele an einer Stelle, `
  + `${geschrieben.size} geschriebene Typen haben alle einen Weg.`);
