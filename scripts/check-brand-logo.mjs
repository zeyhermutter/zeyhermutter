import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

// Geprüft wird das Logo, das tatsächlich ausgeliefert wird: app/components/
// public-shell.tsx importiert brandLogoDataUri aus app/brand-logo-data, und das
// löst auf index.ts auf. Die frühere Fassung dieser Prüfung sah sich die
// Dateien part1..part8 an — die importiert niemand. Sie wurde damit grün,
// ohne das ausgelieferte Bild je anzufassen.

const EXPECTED_WIDTH = 377;
const EXPECTED_HEIGHT = 183;

function fail(message) {
  throw new Error(message);
}

// --- PNG: Chunks mit CRC prüfen und die Bilddaten wirklich entpacken ---------
const CRC_TABLE = (() => {
  const table = new Int32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let c = n;
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c;
  }
  return table;
})();

function crc32(buffer) {
  let c = 0xffffffff;
  for (let i = 0; i < buffer.length; i += 1) c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const PNG_CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };

function inspectPng(image, label) {
  if (image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") fail(`${label}: keine gültige PNG-Signatur.`);

  let offset = 8;
  let header = null;
  const idat = [];
  let sawEnd = false;

  while (offset < image.length) {
    if (offset + 8 > image.length) fail(`${label}: Chunk-Kopf reicht über das Dateiende hinaus.`);
    const length = image.readUInt32BE(offset);
    const type = image.toString("ascii", offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > image.length) fail(`${label}: Chunk ${type} reicht über das Dateiende hinaus.`);

    const expected = image.readUInt32BE(dataEnd);
    const actual = crc32(image.subarray(offset + 4, dataEnd));
    if (expected !== actual) fail(`${label}: Prüfsumme von Chunk ${type} stimmt nicht.`);

    if (type === "IHDR") {
      if (header) fail(`${label}: mehr als ein IHDR.`);
      header = {
        width: image.readUInt32BE(dataStart),
        height: image.readUInt32BE(dataStart + 4),
        bitDepth: image[dataStart + 8],
        colorType: image[dataStart + 9],
        interlace: image[dataStart + 12],
      };
    } else if (type === "IDAT") {
      idat.push(image.subarray(dataStart, dataEnd));
    } else if (type === "IEND") {
      sawEnd = true;
    }

    offset = dataEnd + 4;
  }

  if (!header) fail(`${label}: kein IHDR.`);
  if (idat.length === 0) fail(`${label}: keine Bilddaten.`);
  if (!sawEnd) fail(`${label}: kein IEND.`);
  if (header.interlace !== 0) fail(`${label}: Interlacing wird hier nicht geprüft.`);

  const channels = PNG_CHANNELS[header.colorType];
  if (!channels) fail(`${label}: unbekannter Farbtyp ${header.colorType}.`);

  // Der eigentliche Punkt: die Bilddaten werden entpackt, nicht nur gezählt.
  let raw;
  try {
    raw = inflateSync(Buffer.concat(idat));
  } catch (error) {
    fail(`${label}: Bilddaten lassen sich nicht entpacken (${error.message}).`);
  }

  const bytesPerPixel = Math.ceil((header.bitDepth * channels) / 8);
  const bytesPerRow = Math.ceil((header.width * header.bitDepth * channels) / 8);
  const expectedRaw = header.height * (1 + bytesPerRow);
  if (raw.length !== expectedRaw) {
    fail(`${label}: entpackte Bilddaten sind ${raw.length} Bytes, erwartet waren ${expectedRaw}.`);
  }

  // Jede Zeile beginnt mit einem Filterbyte 0..4. Ein falscher Wert heisst,
  // dass die Daten zwar entpackt, aber kein Bild sind.
  for (let row = 0; row < header.height; row += 1) {
    const filter = raw[row * (1 + bytesPerRow)];
    if (filter > 4) fail(`${label}: Zeile ${row} hat den unzulässigen Filtertyp ${filter}.`);
  }

  // Die Zeilenfilter aufloesen, damit sich einzelne Bildpunkte lesen lassen.
  // Ohne das koennte diese Pruefung nur die Masse vergleichen — und der
  // Grundton des Logos ist genau die Stelle, an der ein Fehler sichtbar wird.
  const bild = Buffer.alloc(header.height * bytesPerRow);
  for (let row = 0; row < header.height; row += 1) {
    const filter = raw[row * (1 + bytesPerRow)];
    const quelle = raw.subarray(row * (1 + bytesPerRow) + 1, (row + 1) * (1 + bytesPerRow));
    const ziel = bild.subarray(row * bytesPerRow, (row + 1) * bytesPerRow);
    const oben = row > 0 ? bild.subarray((row - 1) * bytesPerRow, row * bytesPerRow) : null;
    for (let i = 0; i < bytesPerRow; i += 1) {
      const a = i >= bytesPerPixel ? ziel[i - bytesPerPixel] : 0;
      const b = oben ? oben[i] : 0;
      const c = oben && i >= bytesPerPixel ? oben[i - bytesPerPixel] : 0;
      let wert = quelle[i];
      if (filter === 1) wert += a;
      else if (filter === 2) wert += b;
      else if (filter === 3) wert += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        wert += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      ziel[i] = wert & 0xff;
    }
  }

  const hex = (n) => n.toString(16).toUpperCase().padStart(2, "0");
  const punkt = (x, y) => {
    const i = y * bytesPerRow + x * bytesPerPixel;
    return `${hex(bild[i])}${hex(bild[i + 1])}${hex(bild[i + 2])}`;
  };

  return { ...header, bytesPerPixel, rawBytes: raw.length, punkt };
}

// --- JPEG: Segmente durchlaufen, Masse aus dem SOF lesen ---------------------
function inspectJpeg(image, label) {
  if (image[0] !== 0xff || image[1] !== 0xd8) fail(`${label}: kein SOI-Marker.`);
  if (image[image.length - 2] !== 0xff || image[image.length - 1] !== 0xd9) fail(`${label}: kein EOI-Marker am Ende.`);

  let offset = 2;
  let frame = null;
  let scanBytes = 0;

  while (offset < image.length) {
    if (image[offset] !== 0xff) fail(`${label}: an Position ${offset} steht kein Marker.`);
    let marker = image[offset + 1];
    while (marker === 0xff) { offset += 1; marker = image[offset + 1]; }
    offset += 2;

    if (marker === 0xd9) break;
    if (marker >= 0xd0 && marker <= 0xd7) continue;

    if (offset + 2 > image.length) fail(`${label}: Segmentlänge reicht über das Dateiende hinaus.`);
    const length = image.readUInt16BE(offset);
    if (length < 2) fail(`${label}: unplausible Segmentlänge ${length}.`);

    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame && !frame) {
      frame = {
        precision: image[offset + 2],
        height: image.readUInt16BE(offset + 3),
        width: image.readUInt16BE(offset + 5),
        components: image[offset + 7],
      };
    }

    offset += length;

    if (marker === 0xda) {
      // Nach dem SOS folgen die eigentlichen Bilddaten bis zum EOI.
      const start = offset;
      while (offset < image.length - 1) {
        if (image[offset] === 0xff) {
          const next = image[offset + 1];
          if (next === 0xd9) break;
          if (next !== 0x00 && !(next >= 0xd0 && next <= 0xd7)) break;
        }
        offset += 1;
      }
      scanBytes += offset - start;
    }
  }

  if (!frame) fail(`${label}: kein SOF-Segment, also keine Bildmasse.`);
  if (frame.components < 1) fail(`${label}: keine Farbkomponenten.`);
  if (scanBytes < 1000) fail(`${label}: nur ${scanBytes} Bytes Bilddaten, das ist kein Logo.`);

  return { ...frame, scanBytes };
}

// --- Das ausgelieferte Logo --------------------------------------------------
// Geprueft wird die Datei, die der Kopfbereich wirklich einbindet.
//
// Die frueheren Fassungen dieser Pruefung sahen sich Dateien an, die niemand
// importierte, und wurden gruen, ohne das ausgelieferte Bild je anzufassen.
// Deshalb steht hier beides: der Pfad wird aus public-shell.tsx gelesen, und
// die Datei an diesem Pfad wird dekodiert.

const shellSource = await readFile(new URL("../app/components/public-shell.tsx", import.meta.url), "utf8");
const pfadTreffer = shellSource.match(/const LOGO = "(\/[^"]+\.(?:png|jpg|jpeg))";/);

if (!pfadTreffer) {
  fail("app/components/public-shell.tsx bindet kein Logo ueber `const LOGO = \"/…\"` ein.");
}

const logoPfad = pfadTreffer[1];
let datei;
try {
  datei = await readFile(new URL(`../public${logoPfad}`, import.meta.url));
} catch {
  fail(`Der Kopfbereich verweist auf ${logoPfad}, aber public${logoPfad} gibt es nicht.`);
}

if (datei.length < 1000) fail(`public${logoPfad} ist nur ${datei.length} Bytes gross — das ist kein Logo.`);

const istPng = datei.subarray(0, 8).toString("hex") === "89504e470d0a1a0a";
const info = istPng
  ? inspectPng(datei, `public${logoPfad}`)
  : inspectJpeg(datei, `public${logoPfad}`);

if (info.width !== EXPECTED_WIDTH || info.height !== EXPECTED_HEIGHT) {
  fail(`public${logoPfad} hat ${info.width}x${info.height}, erwartet waren ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}.`);
}

// Der Kopfbereich ist eine Navy-Flaeche. Bringt das Logo seinen eigenen Grund
// mit, muss dieser exakt derselbe Ton sein, sonst zeichnet sich ein Rechteck
// ab. Geprueft werden die vier Eckpunkte gegen den Wert aus dem Stylesheet.
const cssQuelle = await readFile(new URL("../app/public-website.css", import.meta.url), "utf8");
const navyTreffer = cssQuelle.match(/--zm-navy:\s*#([0-9A-Fa-f]{6});/);
if (!navyTreffer) fail("app/public-website.css definiert kein --zm-navy.");
const navy = navyTreffer[1].toUpperCase();

if (istPng) {
  if (info.bitDepth !== 8 || ![2, 6].includes(info.colorType)) {
    fail(`public${logoPfad}: Grundton nicht pruefbar (Farbtyp ${info.colorType}, ${info.bitDepth} Bit). Erwartet wird RGB oder RGBA mit 8 Bit.`);
  }
  const ecken = [
    info.punkt(0, 0),
    info.punkt(info.width - 1, 0),
    info.punkt(0, info.height - 1),
    info.punkt(info.width - 1, info.height - 1),
  ];
  const abweichend = ecken.filter((farbe) => farbe !== navy);
  if (abweichend.length) {
    fail(
      `Der Grund des Logos passt nicht zum Kopfbereich: Ecken ${ecken.join(", ")}, `
      + `erwartet war ueberall #${navy}. Die Kante des Bildes waere sichtbar.`,
    );
  }
}

console.log(
  `Ausgeliefertes Logo geprueft: public${logoPfad}, ${istPng ? "PNG" : "JPEG"} `
  + `${info.width}x${info.height}, ${datei.length} Bytes`
  + `${istPng ? `, ${info.rawBytes} Bytes entpackt, Grund #${navy}` : ""}.`,
);
