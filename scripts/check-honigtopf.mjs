#!/usr/bin/env node
// Bewacht das versteckte Feld gegen Formular-Roboter.
//
// WAS HIER SCHIEFGING
//
// Das Feld hiess "company" und trug die Beschriftung "Firma". Versteckt war es
// nur fuer Menschen: position:absolute, left:-10000px -- fuer den Browser
// weiterhin display:block und visibility:visible, also ein ganz normales
// Eingabefeld. Und "company" plus "Firma" ist exakt das Muster, an dem Chrome
// das Feld ORGANISATION aus dem gespeicherten Adressprofil erkennt.
// autocomplete="off" ignoriert Chrome fuer Adressprofile.
//
// Wer beim Vornamen einen Autofill-Vorschlag annahm, bekam Name, E-Mail,
// Telefon, PLZ, Ort UND die Firma eingetragen -- und war fuer die Seite ein
// Roboter. Die Seite meldete Erfolg und schrieb nichts. Nachgewiesen am
// 08.09.2026 live auf BETA: Erfolgsmeldung da, kein Lead, kein Kontakt, nicht
// einmal ein Aufruf der Edge-Funktion in den Protokollen.
//
// Der Fehler stand fuenfmal im Markup, einmal je oeffentlichem Formular.
//
// WAS DIESE PRUEFUNG SICHERSTELLT
//
// 1. Es gibt genau einen Feldnamen, an einer Stelle: HONIGTOPF_FELD.
// 2. Dieser Name trifft kein Muster, das ein Browser ausfuellen will.
// 3. Auch die Beschriftung im Markup trifft keines.
// 4. Der Honigtopf wird nicht dargestellt (display:none). Ein Feld ausserhalb
//    des Bildes reicht nicht -- daran ist es schon einmal gescheitert.
// 5. Kein oeffentliches Formular schreibt sich das Feld noch selbst hin.
// 6. Jede Route, die den Honigtopf zeigt, prueft ihn auch serverseitig.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const WERTE = path.join(WURZEL, "app/lib/public-intake.ts");
const HUELLE = path.join(WURZEL, "app/components/public-shell.tsx");
const BLATT = path.join(WURZEL, "app/public-website.css");
const ROUTEN = path.join(WURZEL, "app/routes");

// Die Wortbestandteile, an denen Browser ein Feld einem gespeicherten Profil
// zuordnen -- deutsch und englisch, so wie sie in den Autofill-Mustern von
// Chromium und Firefox vorkommen. Ein Honigtopf, dessen Name oder Beschriftung
// einen davon enthaelt, wird frueher oder spaeter ausgefuellt.
const AUSFUELLBAR = [
  "company", "firma", "organisation", "organization", "unternehmen", "betrieb",
  "name", "vorname", "nachname", "surname", "given", "family",
  "mail", "email", "telefon", "phone", "mobil", "handy", "fax",
  "plz", "postleitzahl", "zip", "postal", "ort", "stadt", "city", "town",
  "strasse", "straße", "street", "adresse", "address", "hausnummer",
  "land", "country", "region", "bundesland", "state",
  "geburt", "birth", "datum",
  "karte", "card", "iban", "konto", "cvc", "cvv",
  "url", "website", "webseite", "homepage",
  "passwort", "password", "benutzer", "user", "login",
];

const fehler = [];
function pruefe(bedingung, text) { if (!bedingung) fehler.push(text); }

function trifftMuster(text) {
  const klein = text.toLowerCase();
  return AUSFUELLBAR.filter((muster) => klein.includes(muster));
}

const werte = (await readFile(WERTE, "utf8")).replace(/\r\n/g, "\n");
const huelle = (await readFile(HUELLE, "utf8")).replace(/\r\n/g, "\n");
const blatt = (await readFile(BLATT, "utf8")).replace(/\r\n/g, "\n");

// 1 — der Name steht an genau einer Stelle.
const nameTreffer = werte.match(/export const HONIGTOPF_FELD\s*=\s*["']([^"']+)["']/);
pruefe(nameTreffer, "app/lib/public-intake.ts exportiert kein HONIGTOPF_FELD.");
const feldname = nameTreffer ? nameTreffer[1] : "";

// 2 — der Name trifft kein Autofill-Muster.
if (feldname) {
  const treffer = trifftMuster(feldname);
  pruefe(treffer.length === 0,
    `HONIGTOPF_FELD heisst "${feldname}" und enthaelt ${treffer.map((t) => `"${t}"`).join(", ")}.\n`
    + "  Daran erkennt ein Browser ein Feld aus dem gespeicherten Adressprofil und fuellt es aus.\n"
    + "  Dann meldet das Formular Erfolg und wirft die Anfrage weg.");
}

// 3 — die Beschriftung im Markup trifft kein Autofill-Muster.
const honigtopfBlock = huelle.match(/export function Honigtopf\(\)[\s\S]*?\n}/);
pruefe(honigtopfBlock, "app/components/public-shell.tsx exportiert keine Honigtopf-Komponente.");
if (honigtopfBlock) {
  const block = honigtopfBlock[0];
  pruefe(/name=\{HONIGTOPF_FELD\}/.test(block),
    "Die Honigtopf-Komponente schreibt ihren Feldnamen selbst hin statt HONIGTOPF_FELD zu verwenden.");
  for (const [, beschriftung] of block.matchAll(/<span>([^<]*)<\/span>/g)) {
    const treffer = trifftMuster(beschriftung);
    pruefe(treffer.length === 0,
      `Die Beschriftung "${beschriftung}" enthaelt ${treffer.map((t) => `"${t}"`).join(", ")}.\n`
      + "  Browser werten auch die Beschriftung aus, nicht nur den Feldnamen.");
  }
}

// 4 — der Honigtopf wird nicht dargestellt.
const regel = blatt.match(/\.public-honeypot\s*\{([^}]*)\}/);
pruefe(regel, "In app/public-website.css fehlt die Regel fuer .public-honeypot.");
if (regel) {
  const inhalt = regel[1].replace(/\s+/g, " ").trim();
  pruefe(/display\s*:\s*none/.test(inhalt),
    `.public-honeypot ist "${inhalt}".\n`
    + "  Noetig ist display:none. Ein Feld, das nur ausserhalb des Bildes steht, ist fuer\n"
    + "  den Browser sichtbar -- genau daran sind hier echte Anfragen verschwunden.");
}

// 5 und 6 — die Routen.
const dateien = (await readdir(ROUTEN)).filter((n) => n.startsWith("public-") && /\.tsx?$/.test(n));
for (const datei of dateien) {
  const text = (await readFile(path.join(ROUTEN, datei), "utf8")).replace(/\r\n/g, "\n");

  pruefe(!text.includes('className="public-honeypot"'),
    `app/routes/${datei} schreibt sich den Honigtopf selbst hin.\n`
    + "  Er gehoert in die Honigtopf-Komponente -- sonst laeuft der Feldname wieder auseinander.");

  if (!text.includes("<Honigtopf")) continue;

  pruefe(text.includes("HONIGTOPF_FELD"),
    `app/routes/${datei} zeigt den Honigtopf, prueft ihn aber nirgends serverseitig.\n`
    + "  Ein Honigtopf, den niemand auswertet, haelt keinen einzigen Roboter auf.");
  pruefe(/import \{[^}]*\bHonigtopf\b[^}]*\} from "~\/components\/public-shell"/.test(text),
    `app/routes/${datei} verwendet <Honigtopf/>, ohne es aus ~/components/public-shell zu holen.`);
}

if (fehler.length > 0) {
  console.error(`\nHonigtopf: ${fehler.length} Befund${fehler.length === 1 ? "" : "e"}.\n`);
  for (const f of fehler) console.error(`- ${f}\n`);
  process.exit(1);
}

const zeigen = dateien.filter(() => true);
console.log(`Honigtopf: Feld "${feldname}", display:none, in einer Komponente, `
  + `von ${zeigen.length} geprueften oeffentlichen Routen keine mit eigenem Markup.`);
