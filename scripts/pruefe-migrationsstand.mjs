#!/usr/bin/env node
// Prueft VOR dem ersten Schreibvorgang eines Deploys, ob die Ziel-Datenbank
// genau die Migrationen enthaelt, die im Repo stehen.
//
//   node scripts/pruefe-migrationsstand.mjs <beta|production>
//
// WAS HIER FEHLTE
//
// Die Deploy-Kette spielt Edge-Funktionen und den Worker aus -- aber keine
// Migrationen. Die wurden bisher von Hand angewendet. Am 12.10.2026 stand der
// Stand so:
//
//   Repo          132 Migrationen
//   BETA          131 verbucht -- eine davon unter falscher Versionsnummer,
//                 eine gar nicht, obwohl ihre Tabellen vorhanden waren
//   PRODUKTION    130 verbucht -- die beiden Aufmass-Migrationen fehlen,
//                 die Tabelle measurement_orders gibt es dort nicht
//
// Der Code auf `main` fragt measurement_orders in der Objektakte und im
// Kalender ab. Ein Deploy nach PRODUKTION haette einen Worker gegen eine
// Datenbank gestellt, der die Tabelle fehlt -- und nichts in der Kette haette
// das bemerkt. Derselbe Fehlertyp wie am 07.10.2026: ein Glied der Kette, das
// niemand automatisiert hat, faellt erst auf, wenn es fehlt.
//
// WAS DIESE PRUEFUNG TUT
//
// Sie liest supabase_migrations.schema_migrations der Ziel-Datenbank und
// vergleicht in beide Richtungen mit supabase/migrations/. Fehlt etwas oder
// ist etwas fremd, startet der Deploy nicht.
//
// Sie wendet NICHTS an. Eine Migration nach PRODUKTION bleibt eine bewusste
// Handlung -- dieser Guard sorgt nur dafuer, dass niemand sie vergisst.
//
// WIE SIE FRAGT
//
// Ueber die Supabase Management API, Endpunkt database/query/read-only. Der
// laeuft als supabase_read_only_user: der Guard kann die Datenbank selbst
// dann nicht veraendern, wenn jemand die Abfrage hier falsch umschreibt. Am
// 12.10.2026 in beiden Projekten geprueft, dass diese Rolle
// supabase_migrations.schema_migrations lesen darf.
//
// Das Token ist SUPABASE_ACCESS_TOKEN, das scripts/pruefe-deploy-zugaenge.mjs
// unmittelbar vorher schon verlangt hat. Ein neues Geheimnis braucht es nicht.
//
// WENN DIE FRAGE SELBST SCHEITERT
//
// Dann startet der Deploy ebenfalls nicht. Ein Guard, der bei einem Netzfehler
// durchwinkt, prueft genau dann nicht, wenn es darauf ankommt. Der Endpunkt
// ist laut Supabase-Dokumentation "Beta" -- aendert er sich, steht hier eine
// klare Meldung statt eines stillen Durchlaufs.

import { PROJEKTE, WURZEL } from "./edge-funktionen.mjs";
import { repoMigrationen, vergleiche } from "./migrationsstand.mjs";

const umgebung = process.argv[2];
if (!Object.hasOwn(PROJEKTE, umgebung)) {
  console.error("Aufruf: node scripts/pruefe-migrationsstand.mjs <beta|production>");
  process.exit(2);
}
const projekt = PROJEKTE[umgebung];
const ZIEL = umgebung.toUpperCase();

function abbruch(zeilen) {
  console.error(`\nDeploy nach ${ZIEL} nicht gestartet: ${zeilen[0]}\n`);
  for (const zeile of zeilen.slice(1)) console.error(zeile);
  console.error("");
  process.exit(1);
}

// --- Repo -----------------------------------------------------------------

const { migrationen, ungueltig } = await repoMigrationen(WURZEL);
if (ungueltig.length > 0) {
  abbruch([
    "Dateien in supabase/migrations/ ohne gueltigen Namen.",
    ...ungueltig.map((d) => `  ${d}`),
    "",
    "Erwartet: <14 Ziffern>_<name_in_kleinbuchstaben>.sql",
    "Eine Datei, deren Version sich nicht lesen laesst, kann nicht verglichen werden.",
  ]);
}

// --- Ziel-Datenbank -------------------------------------------------------

const token = String(process.env.SUPABASE_ACCESS_TOKEN ?? "").trim();
if (!token) {
  abbruch([
    "SUPABASE_ACCESS_TOKEN ist leer.",
    "  Normalerweise haelt schon scripts/pruefe-deploy-zugaenge.mjs vorher an.",
    "  Wer hier landet, hat diesen Schritt einzeln aufgerufen.",
  ]);
}

let zeilen;
try {
  const antwort = await fetch(`https://api.supabase.com/v1/projects/${projekt}/database/query/read-only`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query: "select version from supabase_migrations.schema_migrations order by version" }),
  });
  if (!antwort.ok) {
    const text = (await antwort.text()).slice(0, 300);
    abbruch([
      `die Ziel-Datenbank liess sich nicht befragen (HTTP ${antwort.status}).`,
      `  Projekt: ${projekt}`,
      `  Antwort: ${text || "(leer)"}`,
      "",
      "  401/403: das Token gilt nicht fuer dieses Projekt.",
      "  404:     der Endpunkt database/query/read-only hat sich geaendert -- er ist",
      "           laut Supabase noch \"Beta\". Dieses Skript muss dann angepasst werden.",
      "",
      "  Ohne Antwort ist nicht bekannt, ob der Code zur Datenbank passt. Deshalb",
      "  kein Deploy -- ein Guard, der bei einem Fehler durchwinkt, prueft genau",
      "  dann nicht, wenn es darauf ankommt.",
    ]);
  }
  zeilen = await antwort.json();
} catch (fehler) {
  abbruch([
    "die Ziel-Datenbank war nicht erreichbar.",
    `  ${String(fehler?.message ?? fehler)}`,
  ]);
}

if (!Array.isArray(zeilen) || zeilen.some((z) => typeof z?.version !== "string")) {
  abbruch([
    "die Antwort der Datenbank hat nicht die erwartete Form.",
    `  Erwartet: [{ "version": "20260829204901" }, ...]`,
    `  Erhalten: ${JSON.stringify(zeilen).slice(0, 200)}`,
  ]);
}

// --- Vergleich ------------------------------------------------------------

const { fehlen, fremd } = vergleiche(migrationen.map((m) => m.version), zeilen.map((z) => z.version));

if (fehlen.length > 0 || fremd.length > 0) {
  const datei = new Map(migrationen.map((m) => [m.version, m.datei]));
  const meldung = [`die Datenbank passt nicht zum Code.`];
  if (fehlen.length > 0) {
    meldung.push(
      `  ${fehlen.length} Migration${fehlen.length === 1 ? "" : "en"} im Repo, in ${ZIEL} nicht angewendet:`,
      ...fehlen.map((v) => `    ${datei.get(v)}`),
      "",
      "  Der Code verlaesst sich darauf. Ohne sie fragt der Worker nach Tabellen",
      "  oder Spalten, die es nicht gibt. Erst die Migrationen anwenden, in",
      "  dieser Reihenfolge, dann den Deploy erneut starten.",
      "",
    );
  }
  if (fremd.length > 0) {
    meldung.push(
      `  ${fremd.length} Version${fremd.length === 1 ? "" : "en"} in ${ZIEL} verbucht, die es im Repo nicht gibt:`,
      ...fremd.map((v) => `    ${v}`),
      "",
      "  Hier wurde die Datenbank an der Versionsverwaltung vorbei geaendert --",
      "  oder eine Migration unter einer anderen Nummer verbucht als im Repo.",
      "  Erst klaeren, welche Datei dazugehoert, dann Repo oder Buchfuehrung",
      "  angleichen. Ohne das bekommt das naechste Projekt diese Aenderung nie.",
      "",
    );
  }
  abbruch(meldung);
}

console.log(`Migrationsstand ${ZIEL}: alle ${migrationen.length} Migrationen des Repos angewendet, keine fremde Version.`);
