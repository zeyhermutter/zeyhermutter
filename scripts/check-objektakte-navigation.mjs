#!/usr/bin/env node
// Bewacht die Leiste ueber der Objektakte.
//
// WAS HIER SCHIEFGING
//
// Sie war auf 19 Links in einer Zeile gewachsen, Thema fuer Thema, und jeder
// einzelne war fuer sich begruendet. So entsteht eine solche Leiste: niemand
// faellt die Entscheidung, sie zu ueberladen.
//
// Zwei Spuren davon stehen noch im Projektverlauf. In
// crm-light-theme-fixes.css stand: "Die Kontextnavigation der Immobilienakte
// ist mit dem Reiter Maklerauftrag breiter geworden und hat auf
// Laptop-Breite einen horizontalen Seiten-Scroll erzeugt." Geflickt wurde
// das mit overflow-x -- das Symptom, nicht die Ursache.
//
// Schlimmer als die Zahl war die Vermischung: 14 Abschnitte DIESER Akte und
// 5 Links in ANDERE Akten, in derselben Pillenform, nicht zu unterscheiden.
//
// Dazu gab es die Liste zweimal: einmal als Markup und einmal in der Regex,
// die den aktiven Abschnitt erkennt. Wer einen Abschnitt anlegt und nur eine
// Stelle pflegt, bekommt eine Seite ohne Markierung oder einen Link ins Leere.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// 1. Es gibt nur eine Liste: app/lib/objektakte-navigation.ts. Die Leiste
//    schreibt keinen Abschnitt selbst hin.
// 2. Jeder Abschnitt mit einem Pfad hat eine Route, und jede Unterroute von
//    /properties/:propertyId einen Abschnitt. Keine Leiche, kein Loch.
// 3. Jeder Abschnitt ist genau einer Phase zugeordnet oder steht "immer".
// 4. Jeder Status aus IMMOBILIENSTATUS hat eine Phase, und jede Phase hat
//    Abschnitte -- sonst zeigt die Leiste in dieser Phase fast nichts.
// 5. In keiner Phase stehen mehr als HOECHSTENS Abschnitte vorn. Das ist die
//    Zahl, um die es hier ueberhaupt geht.
// 6. Abschnitte und Vorgaenge sind getrennte Zeilen mit eigenen Beschriftungen.

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lies = async (rel) => (await readFile(path.join(WURZEL, rel), "utf8")).replace(/\r\n/g, "\n");

/** Mehr als das passt nicht mehr in eine Zeile, die jemand ueberfliegt. */
const HOECHSTENS = 10;

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const liste = await lies("app/lib/objektakte-navigation.ts");
const leiste = await lies("app/components/property-context-navigation.tsx");
const layout = await lies("app/routes/internal-layout.tsx");
const routen = await lies("app/routes.ts");
const labels = await lies("app/lib/labels.ts");

// --- Die Liste auslesen ---------------------------------------------------

const abschnitte = [...liste.matchAll(
  /\{\s*schluessel:\s*"([^"]+)",\s*beschriftung:\s*"([^"]+)",\s*phasen:\s*(?:"(immer)"|\[([^\]]*)\])\s*\}/g,
)].map((m) => ({
  schluessel: m[1],
  beschriftung: m[2],
  phasen: m[3] ? "immer" : [...m[4].matchAll(/"([A-Z_]+)"/g)].map((p) => p[1]),
}));
pruefe(abschnitte.length >= 10, `Aus AKTE_ABSCHNITTE wurden nur ${abschnitte.length} Abschnitte gelesen -- das Format hat sich vermutlich geaendert.`);

const vorgaenge = [...liste.matchAll(/\{\s*beschriftung:\s*"([^"]+)",\s*liste:\s*"([^"]+)"\s*\}/g)]
  .map((m) => ({ beschriftung: m[1], liste: m[2] }));
pruefe(vorgaenge.length >= 3, `Aus VORGAENGE wurden nur ${vorgaenge.length} Eintraege gelesen.`);

const phasenJeStatus = new Map(
  [...(liste.match(/PHASE_JE_STATUS[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "")
    .matchAll(/([A-Z_]+):\s*"([A-Z_]+)"/g)].map((m) => [m[1], m[2]]),
);
pruefe(phasenJeStatus.size >= 8, `PHASE_JE_STATUS kennt nur ${phasenJeStatus.size} Status.`);

// --- 1. Nur eine Liste ----------------------------------------------------

for (const abschnitt of abschnitte) {
  pruefe(!leiste.includes(`>${abschnitt.beschriftung}<`),
    `app/components/property-context-navigation.tsx schreibt "${abschnitt.beschriftung}" selbst hin.\n`
    + "  Die Leiste baut sich aus AKTE_ABSCHNITTE. Eine zweite Aufzaehlung laeuft irgendwann\n"
    + "  auseinander -- genau daran ist die alte Fassung gescheitert.");
}
pruefe(!/\/properties\/\$\{?[^}]*\}?\/(legal|pricing|media|exposes|documents)/.test(leiste),
  "Die Leiste baut einen Abschnittspfad von Hand. Dafuer gibt es abschnittsPfad().");
pruefe(!layout.includes("property-context-nav\""),
  "routes/internal-layout.tsx enthaelt noch die alte Leiste. Sie gehoert in die Komponente.");

// --- 2. Abschnitte und Routen decken sich --------------------------------

const unterrouten = new Set(
  [...routen.matchAll(/route\(\s*"properties\/:propertyId\/([a-z-]+)"/g)].map((m) => m[1]),
);
// Unterseiten einer Unterseite (…/preview) sind keine eigenen Abschnitte.
for (const abschnitt of abschnitte) {
  if (abschnitt.schluessel === "record") continue;
  pruefe(unterrouten.has(abschnitt.schluessel),
    `AKTE_ABSCHNITTE nennt "${abschnitt.schluessel}", aber app/routes.ts hat keine Route `
    + `properties/:propertyId/${abschnitt.schluessel}. Der Link fuehrt ins Leere.`);
}
const erfasst = new Set(abschnitte.map((a) => a.schluessel));
for (const unterroute of unterrouten) {
  pruefe(erfasst.has(unterroute),
    `app/routes.ts hat properties/:propertyId/${unterroute}, AKTE_ABSCHNITTE kennt den Abschnitt nicht.\n`
    + "  Die Seite ist dann nur ueber die Adresszeile erreichbar und wird in der Leiste\n"
    + "  auch nicht markiert, wenn man auf ihr steht.");
}

// --- 3. und 4. Phasen ----------------------------------------------------

const allePhasen = new Set([...phasenJeStatus.values()]);
for (const abschnitt of abschnitte) {
  if (abschnitt.phasen === "immer") continue;
  pruefe(abschnitt.phasen.length > 0,
    `"${abschnitt.beschriftung}" ist keiner Phase zugeordnet und wuerde nie vorn stehen.\n`
    + '  Entweder eine Phase eintragen oder "immer".');
  for (const phase of abschnitt.phasen) {
    pruefe(allePhasen.has(phase),
      `"${abschnitt.beschriftung}" nennt die Phase "${phase}", die in PHASE_JE_STATUS nicht vorkommt.`);
  }
}

const statusInLabels = [...(labels.match(/IMMOBILIENSTATUS[^=]*=\s*\{([\s\S]*?)\n\};/)?.[1] ?? "")
  .matchAll(/([A-Z_]+):\s*"/g)].map((m) => m[1]);
pruefe(statusInLabels.length >= 8, `Aus IMMOBILIENSTATUS in app/lib/labels.ts wurden nur ${statusInLabels.length} Werte gelesen.`);
for (const status of statusInLabels) {
  pruefe(phasenJeStatus.has(status),
    `Der Status "${status}" hat keine Phase in PHASE_JE_STATUS.\n`
    + "  Ohne Zuordnung faltet die Leiste fuer diese Immobilien gar nicht -- sie zeigt dann\n"
    + "  wieder alles, und niemand merkt, dass ein Status vergessen wurde.");
}
for (const status of phasenJeStatus.keys()) {
  pruefe(statusInLabels.includes(status),
    `PHASE_JE_STATUS nennt "${status}", IMMOBILIENSTATUS in app/lib/labels.ts nicht.`);
}

// --- 5. Die Zahl, um die es geht -----------------------------------------

const proPhase = new Map();
for (const phase of allePhasen) {
  const vorn = abschnitte.filter((a) => a.phasen === "immer" || a.phasen.includes(phase));
  proPhase.set(phase, vorn);
  pruefe(vorn.length <= HOECHSTENS,
    `In der Phase ${phase} stehen ${vorn.length} Abschnitte vorn, erlaubt sind ${HOECHSTENS}:\n`
    + vorn.map((a) => `    ${a.beschriftung}`).join("\n") + "\n"
    + "  Genau so ist die alte Leiste auf 19 gewachsen -- Thema fuer Thema, jedes einzeln\n"
    + "  begruendet. Entweder gehoert der neue Abschnitt in eine andere Phase, oder ein\n"
    + "  anderer gehoert dort nicht mehr hin.");
  pruefe(vorn.length >= 2,
    `In der Phase ${phase} stehen nur ${vorn.length} Abschnitte vorn. Das ist keine Leiste mehr.`);
}

// --- 6. Zwei Zeilen, getrennt --------------------------------------------

pruefe(/aria-label="Abschnitte der Immobilienakte"/.test(leiste),
  "Der Abschnittszeile fehlt ihr aria-label.");
pruefe(/aria-label="Vorgänge zu dieser Immobilie"/.test(leiste),
  "Der Vorgangszeile fehlt ihr aria-label.");
pruefe(/objektakte-vorgang\b/.test(leiste) && /objektakte-abschnitt\b/.test(leiste),
  "Abschnitte und Vorgaenge tragen nicht mehr verschiedene Klassen.\n"
  + "  Dann sehen sie wieder gleich aus, und das war der eigentliche Fehler:\n"
  + "  ein Vorgang fuehrt aus der Akte heraus, ein Abschnitt nicht.");

// Kommentare raus: der Kopf des Stylesheets erklaert, warum dort kein
// !important mehr steht, und das soll die Pruefung nicht selbst anschlagen
// lassen -- sie hat es beim ersten Lauf getan.
const blatt = (await lies("app/property-context-nav.css")).replace(/\/\*[\s\S]*?\*\//g, "");
pruefe(/\.objektakte-vorgang\s*\{[^}]*border:/.test(blatt),
  "In app/property-context-nav.css hat .objektakte-vorgang keinen Rahmen mehr.");
pruefe(!/!important/.test(blatt),
  "app/property-context-nav.css benutzt !important.\n"
  + "  Das Stylesheet ist hell geschrieben; !important hiess frueher, dass eine dunkle\n"
  + "  Regel woanders wieder geradegebogen wird.");

if (fehler.length > 0) {
  console.error(`\nObjektakte-Navigation: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

const je = [...proPhase].map(([p, v]) => `${p} ${v.length}`).join(", ");
console.log(`Objektakte-Navigation: ${abschnitte.length} Abschnitte aus einer Liste, `
  + `${vorgaenge.length} Vorgaenge in eigener Zeile; vorn je Phase: ${je} (erlaubt ${HOECHSTENS}).`);
