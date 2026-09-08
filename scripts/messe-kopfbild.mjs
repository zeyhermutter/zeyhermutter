// Kontrast gegen ein Hintergrundbild laesst sich nicht aus Farbwerten rechnen.
// Deshalb: die Seite zweimal zeichnen -- einmal normal, einmal mit
// unsichtbarer Schrift -- und im zweiten Bild die Flaeche unter jedem
// Textblock abtasten. Verglichen wird der HELLSTE gefundene Bildpunkt gegen
// die Schriftfarbe: der schlechteste Fall entscheidet, nicht der Mittelwert.
import { chromium } from "playwright-core";
import fs from "node:fs";
import { PNG } from "pngjs";

const datei = process.argv[2] ?? "start";
const auswahl = process.argv[3] ?? ".zm-hero";
const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
await page.goto(`file:///tmp/vorschau/${datei}.html`, { waitUntil: "load" });
await page.waitForTimeout(500);

const bloecke = await page.evaluate((sel) => {
  const wurzel = document.querySelector(sel);
  if (!wurzel) return [];
  const raus = [];
  for (const el of wurzel.querySelectorAll("h1, h2, p, a, span, strong, li")) {
    const text = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(" ").trim();
    if (!text) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 2 || r.height < 2 || r.top > window.innerHeight) continue;
    const st = getComputedStyle(el);
    raus.push({
      text: text.slice(0, 40),
      wahl: el.tagName.toLowerCase() + "." + (el.className || "").toString().split(" ").filter(Boolean).join("."),
      farbe: st.color, groesse: parseFloat(st.fontSize), fett: parseInt(st.fontWeight) >= 700,
      x: Math.round(r.x), y: Math.round(r.y), b: Math.round(r.width), h: Math.round(r.height),
    });
  }
  return raus;
}, auswahl);

// Zweiter Durchgang: Schrift unsichtbar, Hintergrund bleibt
await page.addStyleTag({ content: `${auswahl} * { color: transparent !important; }
  ${auswahl} .public-eyebrow::before { visibility: hidden !important; }` });
await page.waitForTimeout(200);
await page.screenshot({ path: "/tmp/vorschau/_grund.png" });
await browser.close();

const png = PNG.sync.read(fs.readFileSync("/tmp/vorschau/_grund.png"));
const kanal = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
const lum = ([r, g, b]) => 0.2126 * kanal(r) + 0.7152 * kanal(g) + 0.0722 * kanal(b);
const verh = (a, b) => { const [h, d] = [lum(a), lum(b)].sort((x, y) => y - x); return (h + .05) / (d + .05); };
const zahl = (c) => c.match(/[\d.]+/g).map(Number).slice(0, 3);

let schlecht = 0;
console.log(`Untergrund gemessen in ${datei}.html ${auswahl} — ${bloecke.length} Textbloecke\n`);
for (const b of bloecke) {
  // Der Rand eines Knopfes gehoert nicht zum Untergrund der Schrift: eine
  // helle 1px-Linie ueber einem hellen Foto waere sonst der "hellste
  // Untergrund", obwohl unter keinem Buchstaben etwas Helles liegt. Deshalb
  // drei Bildpunkte nach innen. Mehr nicht -- sonst misst der Pruefer nur noch
  // die Mitte und wird blind fuer echte Probleme am Rand der Schrift.
  const rand = 3;
  let hellster = null, hoechste = -1, wo = null;
  for (let y = b.y + rand; y < b.y + b.h - rand; y += 2) {
    for (let x = b.x + rand; x < b.x + b.b - rand; x += 2) {
      if (x < 0 || y < 0 || x >= png.width || y >= png.height) continue;
      const i = (png.width * y + x) << 2;
      const p = [png.data[i], png.data[i + 1], png.data[i + 2]];
      const l = lum(p);
      if (l > hoechste) { hoechste = l; hellster = p; wo = [x, y]; }
    }
  }
  if (!hellster) continue;
  const v = verh(zahl(b.farbe), hellster);
  const gross = b.groesse >= 24 || (b.groesse >= 18.66 && b.fett);
  const soll = gross ? 3 : 4.5;
  const ok = v >= soll - 0.005;
  if (!ok) schlecht += 1;
  console.log(`${ok ? "  ok " : "  ZU BLASS"} ${v.toFixed(2)}:1 (nötig ${soll})  hellster Untergrund rgb(${hellster.join(",")}) bei ${wo?.join("/")}  ${b.groesse}px  "${b.text}"`);
}
console.log(`\n${bloecke.length} Bloecke, ${schlecht} unter der Norm.`);
process.exit(schlecht ? 1 : 0);
