// Prueft, dass "es ist nichts erfasst" nur dort steht, wo die Software es
// wirklich weiss.
//
// Warum es diese Pruefung gibt
// ----------------------------
// Die Akten holen ihre Nebendaten in einem Promise.all. Wurde dabei nur
// { data: x } destrukturiert und kein error, dann ist x bei einem Ausfall
// null, die Seite rendert (x ?? []) — und schreibt darunter einen Satz wie
// "Noch keine Person erfasst." Das ist keine leere Liste, das ist eine
// Behauptung, und sie kann falsch sein.
//
// Am 08.09.2026 traf das auf 20 Stellen in acht Akten zu, darunter die
// Geldwaescheakte ("Noch keine Person erfasst") und der Maklerauftrag
// ("Noch kein Auftraggeber hinterlegt. Vor dem Aktivieren wird mindestens
// einer benoetigt."). Beide Saetze steuern eine Entscheidung.
//
// Die Nebenabfrage darf trotzdem nicht die ganze Akte unerreichbar machen.
// Der Ausweg ist der dritte Zustand, nicht der Abbruch:
// <LeerOderFehler fehler={ladefehler} name="x">…</LeerOderFehler>.
//
// Was geprueft wird
// -----------------
// Ein Name, der im Loader aus { data: name } ohne error kommt und in der
// Komponente ueber name.length einen Satz mit "kein", "nicht" oder "noch"
// steuert. Auswahllisten in Formularen sind nicht betroffen — die tragen
// keinen solchen Satz; fuer sie gibt es <Ladehinweis/>.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, sep } from "node:path";

// Begruendete Ausnahmen: Datei → Namen, die ohne error geladen werden duerfen,
// obwohl sie einen solchen Satz steuern.
const AUSNAHMEN = {};

function dateien(ordner, gesammelt = []) {
  for (const eintrag of readdirSync(ordner)) {
    const pfad = join(ordner, eintrag);
    if (statSync(pfad).isDirectory()) dateien(pfad, gesammelt);
    else if (/\.tsx$/.test(eintrag)) gesammelt.push(pfad.split(sep).join("/"));
  }
  return gesammelt;
}

function loaderRumpf(quelle) {
  const i = quelle.search(/export\s+async\s+function\s+loader\s*\(/);
  if (i === -1) return null;
  const j = quelle.indexOf("{", quelle.indexOf(")", i));
  let klammern = 0, k = j;
  for (; k < quelle.length; k++) {
    if (quelle[k] === "{") klammern++;
    else if (quelle[k] === "}") { klammern--; if (klammern === 0) { k++; break; } }
  }
  return { rumpf: quelle.slice(j, k), ende: k };
}

const befunde = [];

for (const datei of dateien("app")) {
  const quelle = readFileSync(datei, "utf8");
  const l = loaderRumpf(quelle);
  if (!l) continue;

  const ohneError = new Set();
  for (const m of l.rumpf.matchAll(/\{\s*data\s*:\s*([A-Za-z0-9_$]+)\s*\}/g)) ohneError.add(m[1]);
  for (const m of l.rumpf.matchAll(/\{\s*data\s*:\s*([A-Za-z0-9_$]+)\s*,\s*error/g)) ohneError.delete(m[1]);
  if (!ohneError.size) continue;

  const erlaubt = AUSNAHMEN[datei] ?? [];
  const rest = quelle.slice(l.ende);

  for (const name of ohneError) {
    if (erlaubt.includes(name)) continue;
    const muster = new RegExp(
      `${name}(?:\\s*\\?\\?\\s*\\[\\])?\\s*\\.length\\s*(?:===\\s*0|\\?)[\\s\\S]{0,400}?empty-state[^>]*>([^<]{5,160})`,
      "g",
    );
    for (const m of rest.matchAll(muster)) {
      const satz = m[1].replace(/\s+/g, " ").trim();
      if (!/kein|nicht|noch/i.test(satz)) continue;
      befunde.push({ datei, name, satz });
    }
  }
}

if (befunde.length) {
  console.error(`\nBehauptungen auf ungeprüfter Grundlage: ${befunde.length}\n`);
  for (const b of befunde) console.error(`  ${b.datei}\n    ${b.name}: „${b.satz}"`);
  console.error(`
Die Abfrage laeuft ohne Fehlerpruefung, der Satz behauptet aber, es sei
nichts erfasst. So wird daraus die Wahrheit:

  const [{data:x,error:xFehler}] = await Promise.all([...]);
  return data({ ladefehler:[xFehler&&"x"].filter(Boolean) as string[], x:x??[], … });

  <LeerOderFehler fehler={ladefehler} name="x">Noch nichts erfasst.</LeerOderFehler>

Soll eine Stelle wirklich so bleiben, wird sie in
scripts/check-leerbehauptung.mjs unter AUSNAHMEN eingetragen — mit Begruendung.
`);
  process.exit(1);
}

console.log("Leere Listen: keine Behauptung auf ungeprüfter Grundlage.");
