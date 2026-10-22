#!/usr/bin/env node
// Bewacht die Bereiche des Programmrahmens.
//
// WIE DAS AUFKAM
//
// Am 12.10.2026 wurde der Seitenstreifen mit 31 gleichrangigen Eintraegen
// durch sechs Bereiche ersetzt, jeder mit seinen Unterpunkten
// (app/lib/programmbereiche.ts). Bei so einem Umbau geht leicht etwas
// verloren -- eine Liste, die man danach nur noch ueber die Adresszeile
// findet. Niemand merkt es, weil nichts fehlt, was man sieht.
//
// Schon beim ersten Abgleich fiel eine solche Liste auf: /pipeline
// ("In Bewegung") stand in keinem Menue, nur als Knopf auf der Uebersicht.
//
// WAS GEPRUEFT WIRD
//
// 1. Jeder Eintrag des alten Seitenstreifens ist ein Unterpunkt -- in genau
//    einem Bereich.
// 2. Jede Liste unter dem internen Layout in app/routes.ts ist ein Unterpunkt
//    oder steht unten begruendet als Ausnahme. Eine neue Liste ohne Platz in
//    der Navigation haelt den Build an.
// 3. Jeder Unterpunkt fuehrt auf eine Route, die es gibt.
// 4. Jeder Bereich startet auf einem seiner eigenen Unterpunkte.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFile(path.join(WURZEL, p), "utf8").then((t) => t.replace(/\r\n/g, "\n"));
const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

// Der alte Seitenstreifen, Stand 12.10.2026 -- festgeschrieben, damit er beim
// Umbau nicht still schrumpft. Dazu die Glocke, die ebenfalls dort stand.
const ALTER_SEITENSTREIFEN = [
  "/crm", "/reports", "/crm/search", "/crm/tasks", "/crm/email", "/crm/calendar",
  "/acquisition", "/leads", "/crm/sales-readiness",
  "/properties", "/projects", "/mandates", "/measurements", "/purchase-offers", "/reservations", "/closings", "/commissions",
  "/inquiries", "/search-profiles", "/viewings",
  "/after-sales", "/referrals", "/case-studies",
  "/crm/website", "/compliance", "/crm/organizations", "/crm/users", "/crm/training", "/crm/archive", "/crm/history", "/crm/hilfe",
  "/crm/notifications",
];

// Seiten des alten Seitenstreifens, die bewusst aus dem Menue genommen wurden.
// Die Seite bleibt bestehen und ueber die Adresse erreichbar.
const AUSGEBLENDET = {
  "/crm/training": "Am 19.10.2026 ausgeblendet (Entscheidung Sebastian): die gesetzliche Weiterbildungspflicht fuer Makler ist entfallen; Seite und Nachweise bleiben.",
};

// Routen ohne Parameter, die bewusst nicht in der Navigation stehen.
const AUSNAHMEN = {
  ...AUSGEBLENDET,
  "/__preview/sales-readiness": "Vorschau fuer die Entwicklung, keine Arbeitsseite.",
  "/api/sales-readiness-ai": "Schnittstelle fuer den Assistenten, liefert Daten, keine Seite.",
  "/api/geocode-address": "Schnittstelle fuer die Adresssuche, liefert Daten, keine Seite.",
  "/api/kontakte": "Schnittstelle fuer die Kontaktsuche in Auswahlfeldern, liefert Daten, keine Seite.",
  "/api/datensaetze": "Schnittstelle fuer die Suche nach Lead, Objekt, Suchprofil, Anfrage und Besichtigung in Auswahlfeldern, liefert Daten, keine Seite.",
  "/api/aufgaben": "Speichert Aufgaben aus dem Aufgaben-Baustein und fuehrt zurueck in die Akte, keine Seite.",
  "/api/objekt-rechte": "Liefert den Reitern der Objektakte die Rechte des Benutzers, keine Seite.",
  "/api/telefonat": "Speichert ein schnell erfasstes Telefonat und fuehrt zurueck in die Akte, keine Seite.",
  "/api/whatsapp": "Haelt fest, dass WhatsApp aus der Kontaktakte geoeffnet wurde, keine Seite.",
  "/crm/calendar/abo": "Legt das Kalender-Abo an oder beendet es, gerufen aus dem Kalender, keine Seite.",
  "/api/naechster-schritt": "Liefert die Ampel einer Liste als Daten, keine Seite.",
  "/api/stillstand": "Liefert den Stillstand fuer Mein Tag als Daten, keine Seite.",
  "/api/suche": "Liefert die Treffer der Schnellsuche (Strg+K) als Daten, keine Seite.",
  "/api/website-zugriff": "Nimmt die datensparsame Zugriffsmeldung der oeffentlichen Website entgegen, liefert keine Arbeitsseite.",
  "/crm/website/statistik": "Absichtlich versteckte interne Website-Auswertung; nur mit Audit-Recht und nur ueber die direkte Adresse erreichbar.",
  "/inquiries/assistent": "Formular zum Anlegen einer Anfrage aus eingefuegtem Text, wie /inquiries/new; erreichbar aus der Anfrageliste und mit Strg+K.",
  "/logout": "Abmelden steht als Knopf in der Titelleiste.",
};

// --- Bereiche lesen -------------------------------------------------------

const quelle = await lies("app/lib/programmbereiche.ts");
const bloecke = [...quelle.matchAll(/\{\s*schluessel:\s*"([a-z]+)",\s*beschriftung:\s*"([^"]+)",\s*start:\s*"([^"]+)",\s*unterpunkte:\s*\[([\s\S]*?)\],/g)];
pruefe(bloecke.length === 7,
  `In app/lib/programmbereiche.ts wurden ${bloecke.length} Bereiche gelesen, erwartet 7 (sechs und die Verwaltung).`);

const bereiche = bloecke.map((b) => ({
  schluessel: b[1], beschriftung: b[2], start: b[3],
  unterpunkte: [...b[4].matchAll(/pfad:\s*"([^"]+)"/g)].map((m) => m[1]),
}));

const besitzer = new Map();
for (const b of bereiche) {
  for (const p of b.unterpunkte) besitzer.set(p, [...(besitzer.get(p) ?? []), b.beschriftung]);
}

// --- 1. Alter Seitenstreifen vollstaendig ---------------------------------

for (const pfad of ALTER_SEITENSTREIFEN) {
  if (AUSGEBLENDET[pfad]) { pruefe(!besitzer.has(pfad), `${pfad} ist als ausgeblendet eingetragen, steht aber wieder im Menue.`); continue; }
  const bei = besitzer.get(pfad) ?? [];
  pruefe(bei.length === 1,
    bei.length === 0
      ? `${pfad} stand im alten Seitenstreifen und ist in keinem Bereich.\n  Ohne Unterpunkt ist die Seite nur noch ueber die Adresszeile erreichbar.`
      : `${pfad} steht in ${bei.length} Bereichen (${bei.join(", ")}). Jede Seite gehoert in genau einen.`);
}
for (const [pfad, bei] of besitzer) {
  pruefe(bei.length === 1, `${pfad} steht in mehreren Bereichen: ${bei.join(", ")}.`);
}

// --- 2. Jede Liste hat einen Platz ----------------------------------------

const routen = await lies("app/routes.ts");
const intern = routen.slice(routen.indexOf('layout("routes/internal-layout.tsx"'));
const allePfade = [...intern.matchAll(/route\("([^"]+)"/g)].map((m) => `/${m[1]}`);
const listen = allePfade.filter((p) => !p.includes(":") && !p.endsWith("/new") && !p.endsWith(".ics"));

for (const liste of listen) {
  if (AUSNAHMEN[liste]) continue;
  pruefe(besitzer.has(liste),
    `Die Liste ${liste} hat keinen Platz in den Bereichen.\n`
    + "  Trag sie in app/lib/programmbereiche.ts ein -- oder unten in AUSNAHMEN mit Grund.");
}
for (const [pfad, grund] of Object.entries(AUSNAHMEN)) {
  pruefe(listen.includes(pfad), `Die Ausnahme ${pfad} gibt es in app/routes.ts nicht mehr. Streichen.`);
  pruefe(grund.length >= 20, `Die Ausnahme ${pfad} hat keine brauchbare Begruendung.`);
}

// --- 3. Jeder Unterpunkt fuehrt irgendwohin -------------------------------

for (const pfad of besitzer.keys()) {
  pruefe(allePfade.includes(pfad), `Der Unterpunkt ${pfad} fuehrt auf keine Route in app/routes.ts.`);
}

// --- 4. Jeder Bereich startet auf einem eigenen Unterpunkt ----------------

for (const b of bereiche) {
  pruefe(b.unterpunkte.includes(b.start),
    `Der Bereich ${b.beschriftung} startet auf ${b.start}, das nicht zu seinen Unterpunkten gehoert.\n`
    + "  Ein Klick auf den Bereich wuerde in einem anderen Bereich landen.");
}

// --- Ergebnis -------------------------------------------------------------

function ausgeben() {
  console.error(`\nProgrammbereiche: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
}
if (fehler.length > 0) { ausgeben(); process.exit(1); }

const zahl = [...besitzer.keys()].length;
console.log(`Programmbereiche: ${bereiche.length} Bereiche mit ${zahl} Unterpunkten, alle ${ALTER_SEITENSTREIFEN.length} `
  + `Eintraege des alten Seitenstreifens erreichbar, jede Liste hat einen Platz (${Object.keys(AUSNAHMEN).length} begruendete Ausnahmen).`);
