#!/usr/bin/env node
// Bewacht, dass jeder Zeitpunkt in der Datenbank im Kalender ankommt --
// oder dass jemand bewusst entschieden hat, dass er es nicht soll.
//
// WIE DAS AUFKAM
//
// Sebastian hat am 08.10.2026 gefragt: "werden alle Termine, auch Aufmass, im
// Kalender hinterlegt?" Die Antwort war nein. Der Kalender las fuenf Quellen;
// in der Datenbank standen neun Zeitpunkte, zu denen jemand irgendwo hinfaehrt
// oder an etwas erinnert werden will:
//
//   measurement_orders.appointment_at             der Aufmasstermin
//   sale_handover_protocols.handover_at           die Uebergabe
//   lead_sales_readiness_checks.inspection_at     die Begehung zum Check
//   sale_projects.follow_up_at                    Wiedervorlage am Projekt
//
// Alle vier waren erfassbar, keiner war sichtbar. Ein Terminfeld, das in
// keiner Agenda auftaucht, ist kein Termin, sondern eine Notiz -- und wer
// sich darauf verlaesst, verpasst ihn.
//
// Der Aufmasstermin war am Vortag von mir selbst angelegt worden. Die
// Kalenderquellen sind eine von Hand gepflegte Liste, und von Hand gepflegte
// Listen veralten still -- derselbe Fehler wie frueher bei der Sitemap und
// bei den Fluchtlinien.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// Unten steht JEDE Zeitpunktspalte der Datenbank, die ein Termin sein
// koennte. Jede traegt entweder die Kalenderkategorie, die sie liest, oder
// eine Begruendung, warum sie nicht in den Kalender gehoert. Geprueft wird:
//
// 1. Jede Spalte, die im Kalender stehen soll, wird in app/routes/calendar.tsx
//    tatsaechlich abgefragt.
// 2. Jede Kategorie aus TERMINKATEGORIEN hat genau eine Quellspalte.
// 3. Jede Auslassung hat eine Begruendung.
//
// Was sie NICHT leisten kann: eine ganz neue Spalte, die niemand hier
// eintraegt, faellt ihr nicht auf. Die Liste stammt aus der BETA-Datenbank,
// Stand 08.10.2026; die Abfrage dafuer steht unten. Wer eine Tabelle mit
// einem Zeitpunkt anlegt, traegt ihn hier ein -- mit Kategorie oder mit Grund.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFile(path.join(WURZEL, p), "utf8").then((t) => t.replace(/\r\n/g, "\n"));

// select table_name || '.' || column_name from information_schema.columns
// where table_schema='public' and data_type='timestamp with time zone';
// Ohne die Protokollspalten (created_at, updated_at, archived_at, ...).
const ZEITPUNKTE = {
  "tasks.due_at": { kategorie: "TASK" },
  "leads.follow_up_at": { kategorie: "LEAD_FOLLOWUP" },
  "sale_projects.follow_up_at": { kategorie: "PROJECT_FOLLOWUP" },
  "leads.valuation_appointment_at": { kategorie: "LEAD_VALUATION" },
  "lead_sales_readiness_checks.inspection_at": { kategorie: "READINESS_INSPECTION" },
  "viewings.starts_at": { kategorie: "VIEWING" },
  "measurement_orders.appointment_at": { kategorie: "MEASUREMENT" },
  "sale_closings.notary_appointment_at": { kategorie: "CLOSING_NOTARY" },
  "sale_handover_protocols.handover_at": { kategorie: "HANDOVER" },

  "viewings.ends_at": { grund: "Das Ende derselben Besichtigung. Es steht als Endzeit an ihrem Termin und waere als eigener Eintrag eine Dublette." },
  "property_marketing_placements.planned_go_live_at": { grund: "Geplanter Zeitpunkt, zu dem eine Anzeige online gehen soll. Niemand faehrt dorthin; der Stand steht in der Vermarktungsakte." },
  "lead_sales_readiness_checks.finalized_at": { grund: "Rueckschau: wann der Check abgeschlossen wurde. Ein Zeitpunkt in der Vergangenheit ist kein Termin." },
  "leads.offer_created_at": { grund: "Rueckschau: wann das Angebot erstellt wurde." },
  "property_disclosures.disclosed_at": { grund: "Rueckschau: wann der Objektnachweis erbracht wurde." },
  "property_marketing_placements.live_at": { grund: "Rueckschau: wann die Anzeige tatsaechlich online ging." },
  "property_marketing_placements.ended_at": { grund: "Rueckschau: wann die Anzeige beendet wurde." },
  "property_marketing_placements.last_verified_at": { grund: "Rueckschau: wann die Anzeige zuletzt geprueft wurde." },
  "property_publications.content_review_confirmed_at": { grund: "Rueckschau: wann die inhaltliche Pruefung bestaetigt wurde." },
  "purchase_offers.submitted_at": { grund: "Rueckschau: wann das Kaufangebot eingereicht wurde." },
  "sale_case_studies.website_published_at": { grund: "Rueckschau: wann die Case Study auf der Website erschien." },
  "search_profile_property_decisions.decided_at": { grund: "Rueckschau: wann ueber den Vorschlag entschieden wurde." },
};

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const kategorien = await lies("app/lib/terminkategorien.ts");
const seite = await lies("app/routes/calendar.tsx");

const beschrieben = [...kategorien.matchAll(/schluessel:\s*"([A-Z_]+)"/g)].map((m) => m[1]);
pruefe(beschrieben.length > 0,
  "In app/lib/terminkategorien.ts liess sich keine Kategorie lesen.\n"
  + "  Entweder ist die Liste leer, oder ihre Form hat sich geaendert.");

// --- 1. Jede Kalenderspalte wird auch abgefragt --------------------------

for (const [spalte, eintrag] of Object.entries(ZEITPUNKTE)) {
  if (!eintrag.kategorie) continue;
  const [tabelle, feld] = spalte.split(".");
  pruefe(new RegExp(`\\.from\\("${tabelle}"\\)`).test(seite),
    `${spalte} soll als ${eintrag.kategorie} im Kalender stehen, aber\n`
    + `  app/routes/calendar.tsx fragt die Tabelle ${tabelle} gar nicht ab.`);
  pruefe(seite.includes(feld),
    `${spalte} soll als ${eintrag.kategorie} im Kalender stehen, aber das Feld\n`
    + `  ${feld} kommt in app/routes/calendar.tsx nicht vor.`);
  pruefe(new RegExp(`kind:\\s*"${eintrag.kategorie}"`).test(seite),
    `Der Ladeteil legt keinen Termin mit kind: "${eintrag.kategorie}" an.\n`
    + `  Die Quelle ${spalte} erzeugt damit keinen Eintrag.`);
}

// --- 2. Jede Kategorie hat genau eine Quelle ----------------------------

for (const kategorie of beschrieben) {
  const quellen = Object.entries(ZEITPUNKTE).filter(([, e]) => e.kategorie === kategorie).map(([s]) => s);
  pruefe(quellen.length === 1,
    `Die Kategorie ${kategorie} hat ${quellen.length} Quellspalten${quellen.length ? ` (${quellen.join(", ")})` : ""}.\n`
    + "  Jede Kategorie steht fuer genau einen Zeitpunkt in der Datenbank. Ohne\n"
    + "  Quelle ist sie eine Zeile in der Legende, die nie etwas beschriftet.");
}
for (const [spalte, eintrag] of Object.entries(ZEITPUNKTE)) {
  if (!eintrag.kategorie) continue;
  pruefe(beschrieben.includes(eintrag.kategorie),
    `${spalte} nennt die Kategorie ${eintrag.kategorie}, die es in\n`
    + "  app/lib/terminkategorien.ts nicht gibt.");
}

// --- 3. Jede Auslassung ist begruendet ----------------------------------

for (const [spalte, eintrag] of Object.entries(ZEITPUNKTE)) {
  pruefe(Boolean(eintrag.kategorie) !== Boolean(eintrag.grund),
    `${spalte} braucht entweder eine Kategorie oder eine Begruendung -- genau eines von beidem.`);
  if (eintrag.grund) {
    pruefe(eintrag.grund.length >= 30,
      `Die Auslassung von ${spalte} hat keine brauchbare Begruendung ("${eintrag.grund}").`);
  }
}

// --- Ergebnis -------------------------------------------------------------

const imKalender = Object.values(ZEITPUNKTE).filter((e) => e.kategorie).length;
const ausgenommen = Object.values(ZEITPUNKTE).filter((e) => e.grund).length;

if (fehler.length > 0) {
  console.error(`\nTerminquellen: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Terminquellen: ${imKalender + ausgenommen} Zeitpunkte der Datenbank erfasst -- `
  + `${imKalender} stehen im Kalender, ${ausgenommen} sind begruendet ausgenommen.`);
