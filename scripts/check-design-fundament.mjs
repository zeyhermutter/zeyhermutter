#!/usr/bin/env node
// Visuelles Fundament (Paket C, ab 19.10.2026) -- eine Sperrklinke.
//
// Gemessen am 19.10.2026 im Programm (ohne oeffentliche Website):
// Hunderte Hex-Farben, ein dunkles Grundthema, das ein helles Thema mit
// "!important" ueberschreibt, und Dutzende Schriftgroessen. Das wird
// schrittweise abgebaut (Farben als Rollen in app/styles.css, Dunkelbasis
// abbauen, Schriftstufen). Diese Pruefung haelt jeden erreichten Stand fest:
// die Zahlen duerfen sinken, aber nicht wieder steigen. Wer sie senkt,
// traegt den neuen Stand unten ein.
//
// Gezaehlt wird in app/*.css ohne die Dateien der oeffentlichen Website;
// die Token-Definitionen in :root von app/styles.css zaehlen nicht mit.

import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const OEFFENTLICH = new Set(["public-website.css", "homepage-v7-realtor.css", "homepage-variants.css", "homepage-variants-image.css", "brand-logo.css"]);

// Erreichter Stand. Nur nach unten aendern.
//
// Lehre vom 19.10.2026: Alle 284 "!important" des hellen Themas auf einmal zu
// entfernen, hat der Stil-Fingerabdruck (scripts/stil-fingerabdruck.browser.js)
// auf 35 Seiten mit 225 Abweichungen beantwortet -- darunter unlesbare
// Kartenmarker und ein dunkles Feld in der Lead-Akte. Grund: die dunklen
// Grundregeln sind oft spezifischer oder selbst "!important". Deshalb erst die
// dunkle Grundregel auf den hellen Wert setzen, dann das "!important" der
// passenden hellen Regel entfernen -- Datei fuer Datei, mit Fingerabdruck.
// 20.10.2026 (Schritt 2a/2b): Regeln, deren Klassen in keiner .ts/.tsx-Datei
// mehr vorkommen (auch nicht als Vorlage "praefix-${...}" oder als
// Status-Wert), mit einem echten CSS-Parser (postcss) entfernt -- 56 im hellen
// Thema, 337 in den uebrigen Dateien, dazu properties-workflow.css und
// lead-object-state.css (nirgends eingebunden). Fingerabdruck vorher/nachher.
// 20.10.2026 (Schritt 2c): Bei 50 der 89 Regeln des hellen Themas entfiel
// "!important" (95x). Ausgewaehlt per Kaskaden-Nachrechnung im Browser auf 41
// Seiten: fuer jedes Element und jede Eigenschaft, die eine helle Regel mit
// !important setzt, alle konkurrierenden Regeln (Spezifitaet, Reihenfolge,
// !important, Inline-Stil) -- mit allen Zustaenden gleichzeitig (:hover,
// :focus, :disabled, [open] ...). Nur Regeln, deren Sieger-Wert sich dabei auf
// keiner Seite aendert. Danach im Browser umgeschaltet und berechnete Stile
// verglichen: 0 Abweichungen. Die 13 Regeln mit echten Konflikten und 25 nie
// getroffene behalten ihr !important (naechster Schritt).
// 26.10.2026 (Schritt 3a): Dialoge, Popups, Kartenuebersicht, Status-Pillen und
// Verkaufsstrategie-Check -- 42x "!important" weniger, dazu die tote Regel
// .persistent-app-frame .build-version (der Stempel liegt ausserhalb des
// Rahmens) und die toten Zweige .lead-modal/.lead-modal-backdrop. Geprueft mit
// scripts/kaskade.browser.js auf 41 Seiten, mit geoeffneten Dialogen und
// nachgebautem Inhalt fuer Zustaende ohne Testdaten (Kartenpopup, Check mit
// Szenarien, Unterlagen-Karte, Status-Pillen), danach im Browser umgeschaltet.
// Bewusst NICHT angefasst: die drei Regeln der Eingabefelder (dunkle
// Grundregeln in crm.css, lead.css, property-documents.css und
// sales-readiness-editor.css wuerden sonst gewinnen) und die Schriftfarbe von
// .readiness-recommend (gegen ein dunkles "!important").
// 26.10.2026 (Schritt 3b, Freigabe Sebastian): Eingabefelder ohne
// "!important" (83 -> 72). Grundregel ueber :is() auf (0,3,1), Hover, Fokus
// und gesperrt darueber (0,4,1). Bewusst sichtbar: Fokusrahmen, roter Rahmen
// bei ungueltigen und blockierten Feldern, Statusfarbe der Checklisten-Auswahl
// und gesperrte Textfelder sehen gesperrt aus -- das alte "!important" hatte
// sie verschluckt. Gemessen mit nachgebildeten Zustaenden (:hover/:focus als
// Klasse) auf 19 Seiten vorher/nachher.
// 26.10.2026 (Schritt 4a, Freigabe Sebastian): Werte, die genau einer Rolle
// oder Stufe entsprechen, als Variable geschrieben -- 118 Farben (#ffffff je
// nach Eigenschaft als flaeche bzw. auf-dunkel) und 246 Schriftgroessen
// (11/12/13/14/15/16/20/24px) in 44 Dateien. Gleicher Wert, keine sichtbare
// Aenderung.
// 26.10.2026 (Schritt 4b, Freigabe Sebastian anhand der Vorher/Nachher-
// Liste): die gruenliche Grau-Familie auf die Rollen gelegt -- Schrift auf
// text/text-2/text-leise/text-blass, Rahmen auf linie/linie-leise/linie-feld,
// Flaechen auf grund/flaeche und die neue Rolle flaeche-2 (#f4f6f8). Nur
// in color/border/background, Status- und Akzentfarben bleiben. Schrift:
// 10/10,5 -> 11, 12,5/13,5 -> 13, 17 -> 16, 18 -> 20, 25-28 -> 24,
// .74-.78rem -> 12, .88rem -> 14, .92-.94rem -> 15; <small> ohne eigene
// Groesse -> 13. Ausgenommen: die Farben der Terminkategorien (calendar.css,
// eigene Kontrastpruefung in check-terminfarben.mjs).
// 26.10.2026 (Schritt 4c, Freigabe Sebastian): Reste des dunklen Themas
// entfernt -- 158 Farbangaben in 11 Dateien (dunkle Flaechen und Rahmen,
// helle Schrift auf dunkel), die nachweislich nirgends gewinnen: im Browser
// auf 115 Seiten und Zustaenden (Programm, Dialoge, nachgebauter Inhalt,
// oeffentliche Website, Anmeldung, Fehlerseite) fuer jedes Element und jede
// Farbeigenschaft gegen alle Regeln ohne Zustand und ohne @media
// nachgerechnet. Rahmen-Kurzformen behalten Breite und Stil.
// 26.10.2026 (Statusfarben): je Zustand (info, gut, warnung, fehler)
// Flaeche, Rahmen und Schrift als Rolle --crm-farbe-status-* in styles.css;
// 35 Stellen mit genau diesen Werten umgestellt, keine sichtbare Aenderung.
// Dazu das letzte "!important" des hellen Themas (Schrift der Check-Hinweise):
// sein dunkler Gegenspieler ist mit 4c entfallen.
const HOECHSTENS = { hex: 533, important: 70, schriftgroessen: 11 };

const ROLLEN = ["grund", "flaeche", "flaeche-2", "text", "text-2", "text-leise", "text-blass", "linie", "linie-leise", "linie-feld", "handlung", "auf-dunkel", "verweis", "fehler", "gut",
  "status-info-grund", "status-info-rand", "status-info-text", "status-gut-grund", "status-gut-rand", "status-gut-text",
  "status-warnung-grund", "status-warnung-rand", "status-warnung-text", "status-fehler-grund", "status-fehler-rand", "status-fehler-text"];

const ohneKommentare = (t) => t.replace(/\/\*[\s\S]*?\*\//g, "");
let hex = 0, important = 0;
const groessen = new Set();
const fehler = [];
for (const datei of (await readdir(path.join(WURZEL, "app"))).filter((n) => n.endsWith(".css") && !OEFFENTLICH.has(n))) {
  let text = ohneKommentare((await readFile(path.join(WURZEL, "app", datei), "utf8")).replace(/\r\n/g, "\n"));
  if (datei === "styles.css") text = text.replace(/--crm-(farbe|schrift)-[a-z0-9-]+\s*:[^;]*;/g, "");
  hex += (text.match(/#[0-9a-fA-F]{3,8}\b/g) ?? []).length;
  important += (text.match(/!important/g) ?? []).length;
  // Die Stufen selbst (var(--crm-schrift-..)) zaehlen nicht -- sie sind das Ziel.
  for (const m of text.matchAll(/font-size\s*:\s*([^;}!]+)/g)) if (!/^var\(--crm-schrift-/.test(m[1].trim())) groessen.add(m[1].trim());
}

const styles = (await readFile(path.join(WURZEL, "app/styles.css"), "utf8"));
for (const r of ROLLEN) if (!new RegExp(`--crm-farbe-${r}:`).test(styles)) fehler.push(`app/styles.css: Farbrolle --crm-farbe-${r} fehlt`);
if (hex > HOECHSTENS.hex) fehler.push(`${hex} Hex-Farben in den Stylesheets, erreicht waren ${HOECHSTENS.hex} -- neue Farben als Rolle (var(--crm-farbe-...)) schreiben`);
if (important > HOECHSTENS.important) fehler.push(`${important}x !important, erreicht waren ${HOECHSTENS.important} -- kein neues !important`);
if (groessen.size > HOECHSTENS.schriftgroessen) fehler.push(`${groessen.size} verschiedene Schriftgroessen, erreicht waren ${HOECHSTENS.schriftgroessen} -- eine Stufe var(--crm-schrift-..) nehmen`);

if (fehler.length) {
  console.error("\nDesign-Fundament:\n  " + fehler.join("\n  ") + "\n");
  process.exit(1);
}
console.log(`Design-Fundament: ${ROLLEN.length} Farbrollen definiert; ${hex} Hex-Farben (hoechstens ${HOECHSTENS.hex}), ${important}x !important (hoechstens ${HOECHSTENS.important}), ${groessen.size} Schriftgroessen (hoechstens ${HOECHSTENS.schriftgroessen}).`);
