#!/usr/bin/env node
// Bewacht den geschlossenen Zustand der oeffentlichen Formulare.
//
// WAS HIER SCHIEFGING
//
// Gefunden bei der Abnahme auf PRODUKTION, am Tag des Rollouts. Drei der fuenf
// oeffentlichen Formulare haben einen Schalter, der sie schliesst, solange kein
// Empfaenger eingetragen ist. Zwei davon machen es richtig:
//
//   /bewertung     12 von 13 Feldern abgeschaltet, Knopf abgeschaltet, Hinweis
//   /suchauftrag   25 von 26 Feldern abgeschaltet, Knopf abgeschaltet, Hinweis
//
// Das dritte nicht:
//
//   /verkaufsfertig-check   1 von 17 abgeschaltet -- nur der Knopf
//
// Auf dieser Seite konnte jemand sechzehn Felder ausfuellen -- Name, Anschrift,
// Immobilienart, Zustand, Verkaufshorizont, Nachricht, Einwilligung -- und
// stiess erst ganz unten auf einen Knopf, der nicht reagiert. Der Hinweis
// daneben lautete "Online-Anfrage derzeit deaktiviert. Es erfolgt keine
// Uebertragung." Das ist die Sprache des Entwicklers, nicht die des
// Eigentuemers, und sie nennt keinen anderen Weg.
//
// Dieselbe Seite zeigte im offenen Zustand "BETA-Formular aktiv -- Die Anfrage
// wird sicher als Verkaeufer-Lead im BETA-CRM erfasst." Auf PRODUKTION haette
// dieser Satz Besuchern erzaehlt, ihre Anfrage lande in einem Testsystem.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// Hat eine oeffentliche Formularseite einen Schalter -- erkennbar an
// disabled={!x} irgendwo in der Datei --, dann gilt er fuer ALLES:
//
// 1. Jedes Eingabefeld des Formulars traegt denselben Schalter.
// 2. Der Absendeknopf auch.
// 3. Die Seite sagt im geschlossenen Zustand, dass sie geschlossen ist, und
//    nennt den Weg ueber die Kontaktseite.
//
// Ein halb abgeschaltetes Formular ist schlimmer als ein ganz geschlossenes:
// es nimmt Arbeit entgegen und gibt nichts zurueck.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTEN = path.join(WURZEL, "app/routes");

// Der Satz, den ein geschlossenes Formular sagen muss. Nicht der genaue
// Wortlaut -- aber es muss "geschlossen" dastehen und ein Weg genannt sein.
const SAGT_GESCHLOSSEN = /geschlossen/i;
const NENNT_WEG = /Kontaktseite/i;

const fehler = [];
const pruefe = (bedingung, text) => { if (!bedingung) fehler.push(text); };

const dateien = (await readdir(ROUTEN)).filter((n) => /^public-.*\.tsx$/.test(n)).sort();
pruefe(dateien.length >= 10, `Nur ${dateien.length} oeffentliche Routen gefunden -- das Format hat sich vermutlich geaendert.`);

let geprueft = 0;

for (const datei of dateien) {
  const text = (await readFile(path.join(ROUTEN, datei), "utf8")).replace(/\r\n/g, "\n");

  // Kein Formular, keine Pruefung.
  const block = text.match(/<Form\b[\s\S]*?<\/Form>/);
  if (!block) continue;

  // Kein Schalter: das Formular ist absichtlich immer offen (Kontakt,
  // Objektanfrage). Dann gibt es auch nichts durchzureichen.
  const schalter = [...text.matchAll(/disabled=\{!(\w+)\}/g)].map((m) => m[1]);
  if (schalter.length === 0) continue;

  geprueft += 1;
  const eindeutig = [...new Set(schalter)];
  pruefe(eindeutig.length === 1,
    `app/routes/${datei} schaltet mit mehreren Ausdruecken ab: ${eindeutig.join(", ")}.\n`
    + "  Ein Formular hat einen Zustand, nicht zwei.");
  const name = eindeutig[0];

  // --- 1. und 2. Jedes Feld und der Knopf -------------------------------

  const felder = [...block[0].matchAll(/<(input|select|textarea|button)\b[^>]*>/g)]
    .map((m) => ({ tag: m[1], roh: m[0] }))
    // Platzhalterzeilen einer Auswahlliste tragen ihr eigenes disabled.
    .filter((f) => !/^<option/.test(f.roh));

  const offen = felder.filter((f) => !f.roh.includes(`disabled={!${name}}`));
  pruefe(offen.length === 0,
    `app/routes/${datei}: ${offen.length} von ${felder.length} Feldern bleiben bedienbar, `
    + `obwohl die Seite mit !${name} schliesst:\n`
    + offen.slice(0, 6).map((f) => `    ${f.roh.slice(0, 92)}`).join("\n")
    + (offen.length > 6 ? `\n    ... und ${offen.length - 6} weitere` : "") + "\n"
    + "  Wer das Formular ausfuellt, stoesst erst am Absendeknopf auf den geschlossenen\n"
    + "  Zustand -- nach der ganzen Tipparbeit. Jedes Feld braucht denselben Schalter.");

  // --- 3. Der Hinweis ----------------------------------------------------

  pruefe(SAGT_GESCHLOSSEN.test(text),
    `app/routes/${datei} sagt nirgends, dass das Formular geschlossen ist.\n`
    + "  Ein Besucher sieht sonst nur ein Formular, das nicht reagiert.");
  pruefe(NENNT_WEG.test(text),
    `app/routes/${datei} nennt im geschlossenen Zustand keinen anderen Weg.\n`
    + "  Ein Hinweis ohne Alternative schickt den Interessenten weg. Die Kontaktseite\n"
    + "  ist offen -- also dorthin verweisen, wie /bewertung und /suchauftrag es tun.");

  // --- 4. Keine Entwicklernotiz auf einer oeffentlichen Seite ------------

  for (const wort of ["BETA-CRM", "BETA-Formular", "Testsystem", "Staging"]) {
    pruefe(!text.includes(wort),
      `app/routes/${datei} zeigt "${wort}" auf einer oeffentlichen Seite.\n`
      + "  Was als Hinweis fuer die Entwicklung gedacht war, liest auf PRODUKTION\n"
      + "  jeder Besucher -- und glaubt, seine Anfrage lande in einem Testsystem.");
  }
}

pruefe(geprueft >= 3, `Nur ${geprueft} Formulare mit Schalter gefunden, erwartet sind mindestens drei (Verkaufsstrategie-Check, Bewertung, Suchauftrag).`);

if (fehler.length > 0) {
  console.error(`\nGeschlossene Formulare: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

console.log(`Geschlossene Formulare: ${geprueft} Formulare mit Schalter -- alle Felder und Knoepfe `
  + "folgen ihm, Hinweis und Alternative stehen auf jeder Seite.");
