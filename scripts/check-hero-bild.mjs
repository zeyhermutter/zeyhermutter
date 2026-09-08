#!/usr/bin/env node
// Bewacht das Foto im Kopfbereich der Startseite.
//
// WAS DIESER PRUEFER KANN UND WAS NICHT
//
// Er kann nicht in das Foto hineinsehen. Node dekodiert kein WebP, und
// Playwright ins Projekt zu holen, nur damit bei jedem Build ein Browser
// startet, waere fuer eine Pruefung dieser Groesse unverhaeltnismaessig.
//
// Er bewacht deshalb die Groesse, die tatsaechlich im Blatt steht und die
// jemand versehentlich aufmachen kann: die Deckkraft des Navy-Verlaufs dort,
// wo die Schrift endet. Das Foto selbst wird nur auf Vorhandensein und eine
// vernuenftige Dateigroesse geprueft.
//
// WOHER DIE ZAHL KOMMT
//
// Die Grenze ist nicht geschaetzt. Die fertig gezeichnete Startseite wurde
// Bildpunkt fuer Bildpunkt vermessen: Seite zweimal rendern, einmal mit
// unsichtbarer Schrift, und im zweiten Bild die Flaeche unter jedem Textblock
// abtasten. Bei 78 Prozent Deckung im Textbereich lag der schwaechste Wert
// bei 4,88:1 -- die Einleitung in --zm-auf-navy-leise, das hellste Grau im
// Kopfbereich. Noetig sind 4,5:1.
//
// Der Sicherheitsabstand ist knapp, und das ist Absicht: das Foto enthaelt
// reinweisse Stellen (Schnee auf den Alpen). Sie liegen weit rechts, wo keine
// Schrift steht. Wer ein anderes Foto einsetzt, dessen helle Stellen weiter
// links liegen, muss neu messen -- diese Pruefung merkt das nicht.
//
//   node scripts/messe-kopfbild.mjs   (nicht Teil des Builds, braucht Playwright)

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BLATT = path.join(WURZEL, "app/public-website.css");

// --zm-hero > * hat max-width: 760px in einem Feld von hoechstens 1180px.
// Weiter rechts steht keine Schrift.
const TEXT_ANTEIL = 760 / 1180;

// Gemessen, siehe oben.
const MINDESTDECKUNG = 0.78;

function fehler(text) {
  console.error(`\nKopfbild: ${text}\n`);
  process.exit(1);
}

const css = await readFile(BLATT, "utf8");

const block = css.match(/--zm-hero-bild:\s*([\s\S]*?);\n/);
if (!block) fehler("In app/public-website.css fehlt --zm-hero-bild.");
const wert = block[1];

if (/^\s*none\s*$/.test(wert.trim())) {
  console.log("Kopfbild: keines gesetzt (--zm-hero-bild: none). Nichts zu pruefen.");
  process.exit(0);
}

const bildTreffer = wert.match(/url\(["']?([^"')]+)["']?\)/);
if (!bildTreffer) fehler("--zm-hero-bild enthaelt keine Bilddatei.");
const oeffentlich = bildTreffer[1];
if (!oeffentlich.startsWith("/")) fehler(`Der Bildpfad "${oeffentlich}" ist nicht absolut.`);

let bild;
try {
  bild = await readFile(path.join(WURZEL, "public", oeffentlich.replace(/^\//, "")));
} catch {
  fehler(`Die Datei public${oeffentlich} fehlt, obwohl das Blatt sie einbindet. Der Kopfbereich waere leer.`);
}
if (bild.length < 20 * 1024) fehler(`public${oeffentlich} ist nur ${bild.length} Bytes gross. Das ist kein Foto in brauchbarer Aufloesung.`);
if (bild.length > 500 * 1024) fehler(`public${oeffentlich} ist ${(bild.length / 1024).toFixed(0)} KB gross. Das laedt vor dem ersten Bildschirminhalt und gehoert verkleinert.`);

const stuetzen = [...wert.matchAll(/rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*([\d.]+)\s*\)\s+([\d.]+)%/g)]
  .map((m) => ({ deckung: Number(m[1]), bei: Number(m[2]) / 100 }))
  .sort((a, b) => a.bei - b.bei);

if (stuetzen.length < 2) {
  fehler("Vor dem Foto liegt kein Verlauf mit mindestens zwei Stuetzpunkten.\n"
    + "  Ein Foto ohne Abdeckung traegt keinen hellen Text: die hellen Stellen sind heller als die Schrift.");
}

function deckungBei(anteil) {
  if (anteil <= stuetzen[0].bei) return stuetzen[0].deckung;
  for (let i = 0; i < stuetzen.length - 1; i += 1) {
    const a = stuetzen[i], b = stuetzen[i + 1];
    if (anteil >= a.bei && anteil <= b.bei) {
      if (b.bei === a.bei) return Math.min(a.deckung, b.deckung);
      return a.deckung + (b.deckung - a.deckung) * ((anteil - a.bei) / (b.bei - a.bei));
    }
  }
  return stuetzen[stuetzen.length - 1].deckung;
}

// Im gesamten Textbereich, nicht nur an seinem Rand: der Verlauf koennte in
// der Mitte einbrechen.
let schwaechste = 1, schwaechsteStelle = 0;
for (let anteil = 0; anteil <= TEXT_ANTEIL; anteil += 0.01) {
  const d = deckungBei(anteil);
  if (d < schwaechste) { schwaechste = d; schwaechsteStelle = anteil; }
}

if (schwaechste < MINDESTDECKUNG) {
  fehler(`Der Verlauf deckt bei ${(schwaechsteStelle * 100).toFixed(0)} Prozent der Breite nur ${(schwaechste * 100).toFixed(0)} Prozent.\n`
    + `  Noetig sind ${(MINDESTDECKUNG * 100).toFixed(0)} Prozent im gesamten Textbereich (bis ${(TEXT_ANTEIL * 100).toFixed(0)} Prozent).\n`
    + "  Darunter wird die Einleitung auf hellen Stellen des Fotos unlesbar.");
}

console.log(`Kopfbild: public${oeffentlich} (${(bild.length / 1024).toFixed(0)} KB), `
  + `Verlauf deckt im Textbereich mindestens ${(schwaechste * 100).toFixed(0)} Prozent (noetig ${(MINDESTDECKUNG * 100).toFixed(0)}).`);
