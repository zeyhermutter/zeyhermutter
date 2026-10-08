#!/usr/bin/env node
// Bewacht das Modul "Technisches Immobilienaufmass".
//
// WAS HIER SCHIEFGEHEN KANN
//
// Ein Leistungspaket steht an vier Stellen, und keine davon merkt es, wenn
// eine der anderen fehlt:
//
//   supabase/migrations/..._measurement_order_module.sql   der Wertebereich
//   app/lib/labels.ts                     die Beschriftung auf dem Bildschirm
//   supabase/functions/website-inquiry/   was das oeffentliche Formular annimmt
//   app/routes/public-measurement.tsx     Preis und Inhalt des Pakets
//
// Ein fuenftes Paket legt man dort an, wo man gerade arbeitet. Faellt es in
// der Edge-Funktion aus, weist sie die Anfrage mit INVALID_INPUT ab -- der
// Besucher sieht "Bitte pruefen Sie Ihre Angaben" und findet nichts, was er
// pruefen koennte. Fehlt es in der Beschriftungstabelle, steht HOUSE_PREMIUM
// im CRM. Fehlt es auf der Seite, kann man es auswaehlen, ohne zu wissen, was
// es kostet.
//
// Dasselbe bei den Zustaenden: die Statusmaschine liegt als Tabelle in der
// Datenbank. Ein Zustand, den keine Zeile dieser Tabelle erreicht, ist tot --
// er steht in der Auswahl der Ansicht, aber kein Auftrag nimmt ihn je an.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// 1. Die Pakete sind in Migration, Beschriftung und Edge-Funktion dieselben.
// 2. Jedes Paket, das das oeffentliche Formular anbietet, hat auf der Seite
//    eine Karte mit Preis -- oder steht hier mit Begruendung als Ausnahme.
// 3. Die Zustaende sind in Migration und Beschriftung dieselben.
// 4. Jeder Zustand ausser dem Startzustand ist ueber mindestens einen
//    Uebergang erreichbar, und aus jedem Zustand ausser den Endzustaenden
//    fuehrt mindestens ein Uebergang weiter.
// 5. Die Flaechengrundlagen sind in Migration und Beschriftung dieselben, und
//    jede ausser "NONE" laesst sich in property_legal_data.living_area_basis
//    uebernehmen.
// 6. Der Aufnahmeweg MEASUREMENT steht in der Zielsteuerung, in der
//    Edge-Funktion und im Typ Aufnahmeweg.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = (p) => readFile(path.join(WURZEL, p), "utf8").then((t) => t.replace(/\r\n/g, "\n"));

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

/** Paket -> Grund, warum es auf der oeffentlichen Seite keine eigene Karte hat. */
const OHNE_KARTE = {
  INDIVIDUAL: "Kein Paket mit festem Umfang, sondern die Auswahl \"etwas anderes\" im Formular. "
    + "Ein Preis liesse sich dafuer nicht nennen, eine Leistungsliste auch nicht.",
};

const START = "DRAFT";
const ENDE = ["PAID", "CANCELLED"];

// --- Quellen lesen --------------------------------------------------------

const migrationsOrdner = (await readdir(path.join(WURZEL, "supabase/migrations")))
  .filter((name) => name.endsWith("_measurement_order_module.sql"));
pruefe(migrationsOrdner.length === 1,
  `Es gibt ${migrationsOrdner.length} Migrationen mit dem Namen *_measurement_order_module.sql, erwartet wird genau eine.`);
const migration = migrationsOrdner.length === 1 ? await lies(`supabase/migrations/${migrationsOrdner[0]}`) : "";

const labels = await lies("app/lib/labels.ts");
const funktion = await lies("supabase/functions/website-inquiry/index.ts");
const seite = await lies("app/routes/public-measurement.tsx");
const aufnahme = await lies("app/lib/public-intake.server.ts");

/** Werte aus einer check-(spalte in (...))-Bedingung der Migration. */
function werteAusCheck(spalte) {
  const treffer = new RegExp(`${spalte}\\s+in\\s*\\(([^)]*)\\)`).exec(migration);
  if (!treffer) return null;
  return [...treffer[1].matchAll(/'([A-Z_0-9]+)'/g)].map((m) => m[1]);
}

/** Schluessel einer Beschriftungstabelle in app/lib/labels.ts. */
function schluesselAusTabelle(name) {
  const treffer = new RegExp(`export const ${name}: Beschriftungen = \\{([^}]*)\\}`).exec(labels);
  if (!treffer) return null;
  return [...treffer[1].matchAll(/([A-Z][A-Z_0-9]*)\s*:/g)].map((m) => m[1]);
}

function vergleiche(was, ausMigration, ausLabels, weitere = []) {
  if (!ausMigration || !ausLabels) {
    fehler.push(`${was}: die Liste liess sich nicht lesen `
      + `(Migration: ${ausMigration ? "ok" : "nicht gefunden"}, labels.ts: ${ausLabels ? "ok" : "nicht gefunden"}).\n`
      + "  Entweder fehlt die Quelle, oder ihre Form hat sich geaendert und diese\n"
      + "  Pruefung liest sie nicht mehr. Beides ist ein Befund.");
    return;
  }
  for (const wert of ausMigration) {
    pruefe(ausLabels.includes(wert),
      `${was}: Die Datenbank kennt "${wert}", app/lib/labels.ts beschriftet den Wert nicht.\n`
      + "  Auf dem Bildschirm stuende dann der rohe Datenbankwert.");
  }
  for (const wert of ausLabels) {
    pruefe(ausMigration.includes(wert),
      `${was}: app/lib/labels.ts beschriftet "${wert}", die Datenbank laesst den Wert nicht zu.\n`
      + "  Die Zeile trifft nie -- entweder ein Tippfehler oder ein Rest.");
  }
  for (const [quelle, liste] of weitere) {
    if (!liste) { fehler.push(`${was}: die Liste in ${quelle} liess sich nicht lesen.`); continue; }
    for (const wert of ausMigration) {
      pruefe(liste.includes(wert), `${was}: ${quelle} kennt "${wert}" nicht.`);
    }
    for (const wert of liste) {
      pruefe(ausMigration.includes(wert), `${was}: ${quelle} nennt "${wert}", die Datenbank laesst den Wert nicht zu.`);
    }
  }
}

// --- 1./2. Pakete ---------------------------------------------------------

const paketeDb = werteAusCheck("service_package");
const paketeLabels = schluesselAusTabelle("AUFMASSPAKET");
const paketeFunktion = (() => {
  const treffer = /const MEASUREMENT_PACKAGES = new Set\(\[([^\]]*)\]\)/.exec(funktion);
  return treffer ? [...treffer[1].matchAll(/"([A-Z_0-9]+)"/g)].map((m) => m[1]) : null;
})();
vergleiche("Leistungspakete", paketeDb, paketeLabels, [["die Edge-Funktion website-inquiry", paketeFunktion]]);

const karten = [...seite.matchAll(/schluessel:\s*"([A-Z_0-9]+)",\s*\n\s*preis:\s*"([^"]+)"/g)]
  .map((m) => ({ schluessel: m[1], preis: m[2] }));
pruefe(karten.length > 0,
  "app/routes/public-measurement.tsx: keine Paketkarte gefunden.\n"
  + "  Entweder steht auf der Seite kein Paket mehr, oder die Form der Liste PAKETE\n"
  + "  hat sich geaendert und diese Pruefung liest sie nicht mehr.");

for (const paket of paketeDb ?? []) {
  const karte = karten.find((eintrag) => eintrag.schluessel === paket);
  if (karte) {
    pruefe(/\d/.test(karte.preis),
      `Das Paket ${paket} hat eine Karte, aber keinen Preis ("${karte.preis}").\n`
      + "  Die Seite nennt Preise -- ein Paket ohne Zahl faellt zwischen den anderen auf\n"
      + "  und laesst den Besucher raten.");
    continue;
  }
  pruefe(Object.hasOwn(OHNE_KARTE, paket),
    `Das Paket ${paket} laesst sich im oeffentlichen Formular auswaehlen, hat auf\n`
    + "  /technisches-aufmass aber keine Karte mit Preis und Leistungen.\n"
    + "  Entweder eine Karte ergaenzen, oder -- wenn das Paket bewusst keine hat --\n"
    + "  in OHNE_KARTE in scripts/check-aufmass.mjs eintragen, mit Begruendung.");
}
for (const karte of karten) {
  pruefe((paketeDb ?? []).includes(karte.schluessel),
    `Die Seite zeigt eine Karte fuer "${karte.schluessel}", die Datenbank kennt das Paket nicht.`);
}
for (const [paket, grund] of Object.entries(OHNE_KARTE)) {
  pruefe(grund.length >= 25, `Die Ausnahme "${paket}" hat keine brauchbare Begruendung.`);
  pruefe((paketeDb ?? []).includes(paket), `OHNE_KARTE nennt "${paket}", die Datenbank kennt das Paket nicht mehr.`);
}

// --- 3./4. Zustaende und ihre Uebergaenge --------------------------------

const statusDb = werteAusCheck("status");
const statusLabels = schluesselAusTabelle("AUFMASSSTATUS");
vergleiche("Zustaende", statusDb, statusLabels);

// Nur die Zeilen der insert-Anweisung lesen. Ohne diese Eingrenzung traf das
// Muster auch "status in ('DELIVERED','INVOICED','PAID')" in der
// Pruefungsfunktion -- und meldete einen Uebergang mehr, als es gibt.
const einfuegeBlock = /insert into public\.measurement_order_status_transitions[^;]*;/.exec(migration)?.[0] ?? "";
const uebergaenge = [...einfuegeBlock.matchAll(/\('([A-Z_]+)','([A-Z_]+)','[^']*'\)/g)].map((m) => ({ von: m[1], nach: m[2] }));
pruefe(uebergaenge.length >= 10,
  `Es wurden nur ${uebergaenge.length} Statusuebergaenge gelesen. Erwartet werden mindestens 10.\n`
  + "  Vermutlich hat sich die Form der insert-Zeilen geaendert.");

for (const zustand of statusDb ?? []) {
  if (zustand !== START) {
    pruefe(uebergaenge.some((u) => u.nach === zustand),
      `Der Zustand ${zustand} ist ueber keinen Uebergang erreichbar.\n`
      + "  Er steht in der Auswahl der Ansicht, aber kein Auftrag nimmt ihn je an.");
  }
  if (!ENDE.includes(zustand)) {
    pruefe(uebergaenge.some((u) => u.von === zustand),
      `Aus dem Zustand ${zustand} fuehrt kein Uebergang weiter.\n`
      + "  Ein Auftrag, der dort ankommt, laesst sich nicht mehr bewegen.");
  }
}
for (const uebergang of uebergaenge) {
  pruefe((statusDb ?? []).includes(uebergang.von) && (statusDb ?? []).includes(uebergang.nach),
    `Der Uebergang ${uebergang.von} -> ${uebergang.nach} nennt einen Zustand, den die Spalte status nicht zulaesst.`);
}

// --- 5. Flaechengrundlagen -----------------------------------------------

const standardDb = werteAusCheck("area_standard");
const standardLabels = schluesselAusTabelle("FLAECHENSTANDARD");
vergleiche("Flaechengrundlagen", standardDb, standardLabels);

const akte = await lies("app/routes/measurement-detail.tsx");
const uebernahme = /const GRUNDLAGE_JE_STANDARD: Record<string,string> = \{([^}]*)\}/.exec(akte);
pruefe(uebernahme, "app/routes/measurement-detail.tsx: die Zuordnung GRUNDLAGE_JE_STANDARD wurde nicht gefunden.");
const zugeordnet = uebernahme ? [...uebernahme[1].matchAll(/([A-Z_0-9]+)\s*:/g)].map((m) => m[1]) : [];
for (const standard of (standardDb ?? []).filter((wert) => wert !== "NONE")) {
  pruefe(zugeordnet.includes(standard),
    `Die Flaechengrundlage ${standard} laesst sich nicht in die Objektakte uebernehmen:\n`
    + "  GRUNDLAGE_JE_STANDARD in app/routes/measurement-detail.tsx kennt sie nicht.\n"
    + "  Der Knopf bleibt dann aus, ohne dass jemand sagen koennte warum.");
}

// --- 6. Der Aufnahmeweg ---------------------------------------------------

pruefe(/sales_readiness_public_intake_config_id_check[\s\S]{0,300}'MEASUREMENT'/.test(migration),
  "Die Migration nimmt MEASUREMENT nicht in die CHECK-Bedingung der Zielsteuerung auf.");
pruefe(/insert into public\.sales_readiness_public_intake_config[\s\S]{0,200}'MEASUREMENT'/.test(migration),
  "Die Migration legt keine Zeile MEASUREMENT in der Zielsteuerung an -- das Formular haette keinen Empfaenger.");
pruefe(/MEASUREMENT:\s*\{[^}]*konfig:\s*"MEASUREMENT"/.test(funktion),
  "Die Edge-Funktion kennt den Weg MEASUREMENT nicht oder haengt ihn nicht an die Zielsteuerung.");
pruefe(/export type Aufnahmeweg =[^;]*"MEASUREMENT"/.test(aufnahme),
  "app/lib/public-intake.server.ts: der Typ Aufnahmeweg kennt MEASUREMENT nicht.");
pruefe(/aufnahmewegOffen\(supabase,\s*"MEASUREMENT"\)/.test(seite),
  "app/routes/public-measurement.tsx fragt nicht, ob der Aufnahmeweg offen ist.\n"
  + "  Ohne diese Frage bietet die Seite ein Formular an, dessen Empfaenger unbekannt ist.");

// --- Ergebnis -------------------------------------------------------------

if (fehler.length > 0) {
  console.error(`\nAufmass-Modul: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Aufmass-Modul: ${paketeDb.length} Pakete in Datenbank, Beschriftung und Edge-Funktion gleich `
  + `(${karten.length} mit Preis auf der Seite, ${Object.keys(OHNE_KARTE).length} begruendet ohne), `
  + `${statusDb.length} Zustaende ueber ${uebergaenge.length} Uebergaenge alle erreichbar, `
  + `${standardDb.length} Flaechengrundlagen, Aufnahmeweg MEASUREMENT vollstaendig verdrahtet.`);
