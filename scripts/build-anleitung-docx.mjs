// Erzeugt die Word-Fassung der Anleitung aus app/help-content.ts.
//
// Eine Quelle, zwei Ausgaben: die Anleitung im CRM und diese Datei zum
// Weitergeben und Ausdrucken lesen denselben Text. Wer den Inhalt aendert,
// aendert ihn in help-content.ts und laesst dieses Skript neu laufen.
//
//   pnpm run anleitung:docx            -> Anleitung-ZeyherMutterOS.docx
//   pnpm run anleitung:docx <ziel>     -> an einen anderen Ort
//
// Braucht Node mit Typ-Entfernung (ab 22.6) und das Paket "docx". Beides ist
// im Projekt vorhanden; "docx" wird nur hier gebraucht und nicht ausgeliefert.

import fs from "node:fs";
import path from "node:path";
// "docx" ist bewusst KEINE Abhaengigkeit des Projekts: die Anwendung braucht es
// nicht, nur dieses Werkzeug. Wer die Word-Fassung neu erzeugen will,
// installiert es einmalig -- global (npm i -g docx) oder im Projekt
// (pnpm add -D docx). Fehlt es, sagt das Skript das, statt mit einem
// Modulfehler abzubrechen.
let docx;
try {
  docx = await import("docx");
} catch {
  console.error("Das Paket \"docx\" fehlt. Einmalig installieren, dann erneut ausfuehren:");
  console.error("  npm install -g docx      (oder: pnpm add -D docx)");
  process.exit(1);
}
const {
  AlignmentType, Bookmark, BorderStyle, Document, Footer, HeadingLevel, ImageRun,
  InternalHyperlink,
  LevelFormat, PageBreak, PageNumber, Packer, Paragraph, ShadingType,
  TableOfContents, TextRun,
} = docx;
import { HELP_CHAPTERS, HELP_INTRO, HELP_TITLE } from "../app/help-content.ts";

const WURZEL = path.resolve(import.meta.dirname, "..");
const BILDER = path.join(WURZEL, "public", "hilfe");

// Seitenbreite A4 abzueglich der Raender: 11906 - 2*1417 = 9072 dxa.
// Bei 1440 dxa je Zoll und 96 Punkten je Zoll sind das rund 605 Bildpunkte.
const BILDBREITE = 600;

// **fett** in Textlaeufe uebersetzen. Dieselbe Regel wie in der Oberflaeche.
function laeufe(text, opts = {}) {
  return text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean).map((teil) =>
    teil.startsWith("**") && teil.endsWith("**")
      ? new TextRun({ text: teil.slice(2, -2), bold: true, ...opts })
      : new TextRun({ text: teil, ...opts }));
}

function absatz(text, extra = {}) {
  return new Paragraph({ children: laeufe(text), spacing: { after: 160, line: 300 }, ...extra });
}

function kasten(text, farbe, rahmen) {
  return new Paragraph({
    children: laeufe(text, { size: 20 }),
    spacing: { before: 120, after: 200, line: 280 },
    shading: { type: ShadingType.CLEAR, fill: farbe },
    border: {
      top: { style: BorderStyle.SINGLE, size: 6, color: rahmen },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: rahmen },
      left: { style: BorderStyle.SINGLE, size: 18, color: rahmen },
      right: { style: BorderStyle.SINGLE, size: 6, color: rahmen },
    },
    indent: { left: 120, right: 120 },
  });
}

function bild(block) {
  const datei = path.join(BILDER, block.datei);
  if (!fs.existsSync(datei)) throw new Error(`Bild fehlt: ${datei}`);
  // Masse stehen in den Daten (help-content.ts) und muessen hier nicht noch
  // einmal aus der Datei gelesen werden.
  return [
    new Paragraph({
      children: [new ImageRun({
        data: fs.readFileSync(datei), type: "jpg",
        transformation: { width: BILDBREITE, height: Math.round(BILDBREITE * block.hoehe / block.breite) },
      })],
      spacing: { before: 120, after: 60 },
    }),
    new Paragraph({
      children: [new TextRun({ text: block.unterschrift, size: 18, color: "536263", italics: true })],
      spacing: { after: 240 },
    }),
  ];
}

function bloecke(kapitel) {
  const raus = [];
  for (const b of kapitel.bloecke) {
    if (b.art === "absatz") raus.push(absatz(b.text));
    else if (b.art === "hinweis") raus.push(kasten(b.text, "F2F7F5", "9BB6AE"));
    else if (b.art === "warnung") raus.push(kasten(b.text, "FDF8EA", "D9BE72"));
    else if (b.art === "bild") raus.push(...bild(b));
    else if (b.art === "liste")
      for (const p of b.punkte)
        raus.push(new Paragraph({ children: laeufe(p), numbering: { reference: "punkte", level: 0 }, spacing: { after: 90, line: 290 } }));
    else if (b.art === "schritte")
      for (const p of b.punkte)
        raus.push(new Paragraph({ children: laeufe(p), numbering: { reference: "schritte", level: 0 }, spacing: { after: 90, line: 290 } }));
  }
  return raus;
}

const heute = new Intl.DateTimeFormat("de-DE", { dateStyle: "long", timeZone: "Europe/Berlin" }).format(new Date());

const inhalt = [
  new Paragraph({ children: [new TextRun({ text: "ZEYHERMUTTER IMMOBILIEN", size: 18, color: "697778", characterSpacing: 60 })], spacing: { after: 120 } }),
  new Paragraph({ children: [new TextRun({ text: HELP_TITLE, bold: true, size: 56, color: "172425" })], spacing: { after: 160 } }),
  new Paragraph({ children: [new TextRun({ text: "Handbuch für neue Mitarbeiterinnen und Mitarbeiter", size: 26, color: "536263" })], spacing: { after: 320 } }),
  absatz(HELP_INTRO),
  kasten(
    "Diese Anleitung steht auch im System selbst: unter Verwaltung → Anleitung, "
    + "und auf jeder Seite über den Hilfe-Knopf unten rechts. Dort ist sie immer "
    + "auf dem Stand der Software — diese Datei ist ein Abzug vom " + heute + ".",
    "F2F7F5", "9BB6AE"),
  new Paragraph({ children: [new PageBreak()] }),
  new Paragraph({ text: "Inhaltsverzeichnis", heading: HeadingLevel.HEADING_1, spacing: { after: 200 } }),
  new TableOfContents("Inhalt", { hyperlink: true, headingStyleRange: "1-1" }),
  new Paragraph({ children: [new TextRun({ text: "Die Seitenzahlen oben füllt Word beim Öffnen — bitte die Nachfrage „Felder aktualisieren\" bestätigen. Die Übersicht darunter steht unabhängig davon und führt per Klick zum Kapitel.", size: 18, color: "697778", italics: true })], spacing: { before: 200, after: 240 } }),
  ...HELP_CHAPTERS.flatMap((k) => [
    new Paragraph({
      children: [new InternalHyperlink({ anchor: `kapitel_${k.id}`, children: [
        new TextRun({ text: `${k.nummer}.  `, bold: true, color: "697778" }),
        new TextRun({ text: k.titel, bold: true, color: "2F4442", underline: {} }),
      ] })],
      spacing: { after: 20 },
    }),
    new Paragraph({
      children: [new TextRun({ text: k.kurz, size: 18, color: "697778" })],
      indent: { left: 340 },
      spacing: { after: 120 },
    }),
  ]),
  new Paragraph({ children: [new PageBreak()] }),
];

HELP_CHAPTERS.forEach((kapitel, i) => {
  if (i > 0) inhalt.push(new Paragraph({ children: [new PageBreak()] }));
  inhalt.push(new Paragraph({
    heading: HeadingLevel.HEADING_1,
    spacing: { after: 60 },
    children: [new Bookmark({ id: `kapitel_${kapitel.id}`, children: [new TextRun(`${kapitel.nummer}. ${kapitel.titel}`)] })],
  }));
  inhalt.push(new Paragraph({ children: [new TextRun({ text: kapitel.kurz, size: 20, color: "536263", italics: true })], spacing: { after: 240 } }));
  inhalt.push(...bloecke(kapitel));
});

const dokument = new Document({
  creator: "ZeyherMutterOS",
  title: HELP_TITLE,
  description: "Handbuch für neue Mitarbeiterinnen und Mitarbeiter",
  numbering: {
    config: [
      { reference: "punkte", levels: [{ level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] },
      { reference: "schritte", levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 460, hanging: 260 } } } }] },
    ],
  },
  styles: {
    default: { document: { run: { font: "Calibri", size: 22, color: "1D2A2B" } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 34, bold: true, color: "172425" }, paragraph: { spacing: { before: 240, after: 140 } } },
    ],
  },
  sections: [{
    properties: { page: { margin: { top: 1417, right: 1417, bottom: 1417, left: 1417 } } },
    footers: {
      default: new Footer({ children: [new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [new TextRun({ text: `${HELP_TITLE}   ·   Seite `, size: 16, color: "8A9899" }),
                   new TextRun({ children: [PageNumber.CURRENT], size: 16, color: "8A9899" }),
                   new TextRun({ text: " von ", size: 16, color: "8A9899" }),
                   new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: "8A9899" })],
      })] }),
    },
    children: inhalt,
  }],
});

const ziel = process.argv[2] ?? path.join(WURZEL, "Anleitung-ZeyherMutterOS.docx");
fs.writeFileSync(ziel, await Packer.toBuffer(dokument));
console.log("geschrieben:", ziel, (fs.statSync(ziel).size / 1024).toFixed(0), "KB");
console.log("Kapitel:", HELP_CHAPTERS.length, "· Bilder:", HELP_CHAPTERS.flatMap(k => k.bloecke).filter(b => b.art === "bild").length);
