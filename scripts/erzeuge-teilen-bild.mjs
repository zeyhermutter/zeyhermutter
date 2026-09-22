#!/usr/bin/env node
// Erzeugt public/marke/teilen.jpg -- das Vorschaubild, das WhatsApp, LinkedIn
// und Co. zeigen, wenn jemand einen Link auf die Webseite weitergibt.
//
// Nicht Teil des Builds: braucht Playwright, wie scripts/messe-kopfbild.mjs.
// Neu erzeugen, wenn sich Logo oder Kopfbild aendern:
//
//   node scripts/erzeuge-teilen-bild.mjs
//
// Zur Gestaltung:
//
// - 1200 x 630, das Format, das alle grossen Dienste erwarten.
// - Das Logo steht in der Mitte. WhatsApp beschneidet die Vorschau in kleinen
//   Ansichten auf ein Quadrat aus der Bildmitte; ein Logo am linken Rand waere
//   dort halb abgeschnitten.
// - Das Logo wird ohne seine eigene Navy-Grundflaeche gezeichnet. Mit ihr stand
//   es als dunkles Rechteck auf dem Foto.
// - Kein zusaetzlicher Text. Alles, was hier stehen koennte, steht schon im
//   Logo oder im Titel der Vorschau darunter.

import { chromium } from "playwright-core";
import { readFile, writeFile, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const WURZEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOGO = path.join(WURZEL, "public/marke/zeyher-mutter-logo.svg");
const FOTO = path.join(WURZEL, "public/marke/muenchen-alpen.webp");
const ZIEL = path.join(WURZEL, "public/marke/teilen.jpg");

const logo = await readFile(LOGO, "utf8");
const ohneGrund = logo.replace(/<path fill="#062037" d="M0 0h565v166H0z"\/>/, "");
if (ohneGrund === logo) throw new Error("Die Navy-Grundflaeche des Logos wurde nicht gefunden. Hat sich die Logodatei geaendert?");

const arbeit = await mkdtemp(path.join(tmpdir(), "teilen-"));
await writeFile(path.join(arbeit, "logo.svg"), ohneGrund);
await writeFile(path.join(arbeit, "foto.webp"), await readFile(FOTO));
await writeFile(path.join(arbeit, "seite.html"), `<!doctype html><meta charset="utf-8"><style>
html,body{margin:0;width:1200px;height:630px;overflow:hidden}
.b{position:relative;width:1200px;height:630px;background:#062037;
 background-image:radial-gradient(ellipse 62% 70% at 50% 50%,rgba(6,32,55,.93) 0%,rgba(6,32,55,.88) 55%,rgba(6,32,55,.62) 100%),url(foto.webp);
 background-size:cover,cover;background-position:center,62% 62%}
.logo{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:640px}
</style><div class="b"><img class="logo" src="logo.svg"></div>`);

const browser = await chromium.launch(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {});
const seite = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await seite.goto(`file://${path.join(arbeit, "seite.html")}`);
await seite.waitForLoadState("networkidle");
await seite.screenshot({ path: ZIEL, type: "jpeg", quality: 84 });
await browser.close();

console.log(`Vorschaubild geschrieben: ${path.relative(WURZEL, ZIEL)}`);
