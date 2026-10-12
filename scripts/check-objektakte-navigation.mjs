#!/usr/bin/env node
// Bewacht die Reiter der Objektakte.
//
// WAS HIER SCHIEFGING
//
// Die Leiste ueber der Objektakte war auf 19 Links in einer Zeile gewachsen,
// Thema fuer Thema, jeder einzeln begruendet. So entsteht eine solche Leiste:
// niemand faellt die Entscheidung, sie zu ueberladen. Dazu waren Abschnitte
// dieser Akte und Verweise in andere Akten nicht zu unterscheiden, und die
// Liste stand zweimal im Code (Markup und Regex).
//
// Am 12.10.2026 wurden daraus neun Reiter mit ihren Seiten darunter, und die
// lange Uebersichtsseite wurde in vier Teile zerlegt, die dieselbe
// Routendatei unter vier Adressen zeigt. Dabei gehen drei Dinge leicht
// schief, und keins faellt beim Bauen auf:
//
// - Eine Seite der Akte hat keinen Reiter (nur ueber einen versteckten
//   Verweis erreichbar) oder ein Reiter keine Seite (Link ins Leere).
// - Ein Teil der langen Seite haengt in app/routes.ts, zeigt aber nichts --
//   oder zeigt etwas, haengt aber nicht.
// - Nach dem Speichern fuehrt die Umleitung auf einen Teil, in dem der
//   gespeicherte Abschnitt gar nicht steht. Wer die Adresse speichert,
//   landet dann auf der Uebersicht und sucht sein Formular.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// 1. Es gibt nur eine Liste: app/lib/objektakte-navigation.ts. Die Reiter-
//    Komponente schreibt keine Beschriftung selbst hin.
// 2. Jede Seite hat eine Route, jede Unterroute von /properties/:propertyId
//    im Immobilien-Arbeitsplatz genau eine Seite. Keine Leiche, kein Loch.
// 3. Hoechstens HOECHSTENS Reiter, jeder mit mindestens einer Seite, keine
//    Seite doppelt.
// 4. Die Teile (TEILE) sind genau die Routen auf routes/property-detail.tsx,
//    und die Seite zeigt fuer jeden Teil etwas.
// 5. Jede Umleitung nach dem Speichern zeigt auf den Teil, der den Abschnitt
//    mit diesem Anker wirklich enthaelt.
// 6. Die Vorgaenge stehen unter genau einem Reiter und fuehren als Verweis
//    hinaus (mit Pfeil), nicht als Seite der Akte.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = async (rel) => (await readFile(path.join(WURZEL, rel), "utf8")).replace(/\r\n/g, "\n");

/** Mehr passt nicht in eine Reiterzeile neben der Liste (gemessen bei 1366 px). */
const HOECHSTENS = 10;

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const liste = await lies("app/lib/objektakte-navigation.ts");
const reiterKomponente = await lies("app/components/objektakte-reiter.tsx");
const routen = await lies("app/routes.ts");
const seite = await lies("app/routes/property-detail.tsx");

// --- Die Liste lesen ------------------------------------------------------

const reiterBlock = /export const REITER[^=]*=\s*\[([\s\S]*?)\n\];/.exec(liste)?.[1] ?? "";
const reiter = [...reiterBlock.matchAll(/\{ schluessel: "([^"]+)", beschriftung: "([^"]+)",([^\n]*)seiten: \[([\s\S]*?)\] \}/g)]
  .map((m) => ({
    schluessel: m[1],
    beschriftung: m[2],
    vorgaenge: /vorgaenge: true/.test(m[3]),
    seiten: [...m[4].matchAll(/\{ schluessel: "([^"]+)", beschriftung: "([^"]+)" \}/g)].map((s) => ({ schluessel: s[1], beschriftung: s[2] })),
  }));

pruefe(reiter.length >= 5,
  `Aus REITER wurden nur ${reiter.length} Reiter gelesen -- das Format in app/lib/objektakte-navigation.ts\n`
  + "  hat sich geaendert, oder die Akte ist zu einem Rest geschrumpft.");

const alleSeiten = reiter.flatMap((r) => r.seiten.map((s) => ({ ...s, reiter: r.beschriftung })));

// --- 1. Eine Liste --------------------------------------------------------

for (const r of reiter) {
  for (const text of [r.beschriftung, ...r.seiten.map((s) => s.beschriftung)]) {
    pruefe(!reiterKomponente.includes(`"${text}"`) && !reiterKomponente.includes(`>${text}<`),
      `app/components/objektakte-reiter.tsx schreibt "${text}" selbst hin.\n`
      + "  Die Reiter kommen aus REITER. Eine zweite Aufzaehlung laeuft irgendwann auseinander.");
  }
}
pruefe(/from "~\/lib\/objektakte-navigation"/.test(reiterKomponente) && /REITER\.map/.test(reiterKomponente),
  "app/components/objektakte-reiter.tsx baut die Reiter nicht aus REITER.");
pruefe(/<ArbeitsplatzReiter\b/.test(reiterKomponente),
  "app/components/objektakte-reiter.tsx benutzt nicht den Baustein ArbeitsplatzReiter.\n"
  + "  Dann sehen die Reiter der Objektakte anders aus als die der Kontaktakte.");

// --- 2. Seiten gegen Routen -----------------------------------------------

const layoutBlock = /layout\("routes\/immobilien-arbeitsplatz\.tsx",\s*\[([\s\S]*?)\n\s*\]\)/.exec(routen)?.[1] ?? "";
pruefe(layoutBlock.length > 0, "In app/routes.ts liess sich der Immobilien-Arbeitsplatz nicht finden.");
const kinder = [...layoutBlock.matchAll(/route\("properties\/:propertyId(?:\/([^"/]+))?[^"]*"/g)].map((m) => m[1] ?? "record");
const unterseiten = [...new Set(kinder)];

for (const s of alleSeiten) {
  pruefe(unterseiten.includes(s.schluessel),
    `Der Reiter "${s.reiter}" nennt die Seite "${s.beschriftung}" (${s.schluessel}), `
    + "aber im Immobilien-Arbeitsplatz in app/routes.ts haengt keine Route dafuer.");
}
for (const u of unterseiten) {
  const n = alleSeiten.filter((s) => s.schluessel === u).length;
  pruefe(n === 1,
    `properties/:propertyId${u === "record" ? "" : `/${u}`} steht ${n}-mal in REITER, erwartet genau einmal.\n`
    + "  Ohne Reiter ist die Seite nur ueber einen versteckten Verweis erreichbar.");
}

// --- 3. Die Zahl, um die es geht ------------------------------------------

pruefe(reiter.length <= HOECHSTENS,
  `Die Objektakte hat ${reiter.length} Reiter, erlaubt sind ${HOECHSTENS}.\n`
  + "  Genau so ist die alte Leiste auf 19 gewachsen. Eine neue Seite gehoert unter einen\n"
  + "  bestehenden Reiter, nicht daneben.");
for (const r of reiter) pruefe(r.seiten.length >= 1, `Der Reiter "${r.beschriftung}" hat keine Seite.`);
const schluessel = reiter.map((r) => r.schluessel);
pruefe(new Set(schluessel).size === schluessel.length, "Zwei Reiter haben denselben Schluessel.");

// --- 4. Die Teile der langen Seite ----------------------------------------

const teile = [...(/export const TEILE = \[([^\]]*)\]/.exec(liste)?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
pruefe(teile.includes("record") && teile.length >= 2, "TEILE in app/lib/objektakte-navigation.ts liess sich nicht lesen.");

const aufDetail = [...layoutBlock.matchAll(/route\("properties\/:propertyId(?:\/([^"/]+))?",\s*"routes\/property-detail\.tsx"/g)].map((m) => m[1] ?? "record");
for (const t of teile) {
  pruefe(aufDetail.includes(t),
    `Der Teil "${t}" steht in TEILE, aber app/routes.ts haengt routes/property-detail.tsx nicht unter dieser Adresse.`);
  pruefe(new RegExp(`\\{teil==="${t}"\\?`).test(seite),
    `routes/property-detail.tsx zeigt fuer den Teil "${t}" nichts ({teil==="${t}"?...} fehlt).\n`
    + "  Der Reiter oeffnete eine leere Seite.");
}
for (const a of aufDetail) {
  pruefe(teile.includes(a),
    `app/routes.ts haengt routes/property-detail.tsx unter "${a}", TEILE kennt diesen Teil nicht.\n`
    + "  Die Seite zeigte dort die Uebersicht ein zweites Mal.");
}

// --- 5. Nach dem Speichern dort landen, wo man war -------------------------

// Die Bloecke je Teil: vom {teil==="x"? bis zum naechsten oder zum Ende.
const anfaenge = [...seite.matchAll(/\{teil==="([^"]+)"\?/g)].map((m) => ({ teil: m[1], ab: m.index }));
const blockVon = (t) => {
  const i = anfaenge.findIndex((a) => a.teil === t);
  if (i < 0) return "";
  return seite.slice(anfaenge[i].ab, anfaenge[i + 1]?.ab ?? seite.length);
};
const teilJeAnker = Object.fromEntries([...(/TEIL_JE_ANKER[^=]*=\s*\{([\s\S]*?)\};/.exec(liste)?.[1] ?? "").matchAll(/(\w+): "([^"]+)"/g)].map((m) => [m[1], m[2]]));
pruefe(Object.keys(teilJeAnker).length >= 3, "TEIL_JE_ANKER in app/lib/objektakte-navigation.ts liess sich nicht lesen.");

const umleitungen = [...seite.matchAll(/redirect\(ankerPfad\(propertyId,"([^"]+)"\)/g)].map((m) => m[1]);
pruefe(umleitungen.length >= 5, `In routes/property-detail.tsx wurden nur ${umleitungen.length} Umleitungen ueber ankerPfad gefunden.`);
pruefe(!/redirect\(`\/properties\/\$\{propertyId\}#/.test(seite),
  "routes/property-detail.tsx leitet an ankerPfad() vorbei auf /properties/:id#... um.\n"
  + "  Der Anker steht dort vielleicht nicht mehr -- die Seite ist in Teile zerlegt.");
for (const anker of new Set(umleitungen)) {
  const t = teilJeAnker[anker];
  pruefe(Boolean(t), `Die Umleitung auf "#${anker}" hat keinen Eintrag in TEIL_JE_ANKER.`);
  if (!t) continue;
  pruefe(blockVon(t).includes(`id="${anker}"`),
    `Nach dem Speichern geht es auf den Teil "${t}" mit #${anker}, aber dort steht kein Abschnitt id="${anker}".\n`
    + "  Man landete nach dem Speichern auf einer Seite ohne das Formular, in dem man war.");
}
pruefe(blockVon("eigentuemer").includes("owner-${owner.id}"),
  'Die Eigentuemerkarten (id="owner-...") stehen nicht im Teil "eigentuemer", ankerPfad() fuehrt aber dorthin.');

// --- 6. Vorgaenge fuehren hinaus ------------------------------------------

pruefe(reiter.filter((r) => r.vorgaenge).length === 1,
  `Die Vorgaenge stehen unter ${reiter.filter((r) => r.vorgaenge).length} Reitern, erwartet genau einem.`);
pruefe(/VORGAENGE\.map\([^)]*\)\s*=>[\s\S]{0,200}hinaus: true/.test(reiterKomponente),
  "Die Vorgaenge werden nicht als Verweis hinaus (hinaus: true) gebaut.\n"
  + "  Dann sehen sie aus wie Seiten der Akte, und das war der urspruengliche Fehler:\n"
  + "  ein Vorgang fuehrt aus der Akte heraus, eine Seite nicht.");

// --- Ergebnis -------------------------------------------------------------

if (fehler.length > 0) {
  console.error(`\nObjektakte-Navigation: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Objektakte-Navigation: ${reiter.length} Reiter (erlaubt ${HOECHSTENS}) mit ${alleSeiten.length} Seiten aus einer Liste, `
  + `${teile.length} Teile der Uebersichtsseite, ${new Set(umleitungen).size} Speicher-Umleitungen landen im richtigen Teil.`);
