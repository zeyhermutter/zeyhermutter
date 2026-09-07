import { readFile } from "node:fs/promises";
import { inflateSync } from "node:zlib";

// Geprüft wird das Logo, das tatsächlich ausgeliefert wird: app/components/
// public-shell.tsx importiert brandLogoDataUri aus app/brand-logo-data, und das
// löst auf index.ts auf. Die frühere Fassung dieser Prüfung sah sich die
// Dateien part1..part8 an — die importiert niemand. Sie wurde damit grün,
// ohne das ausgelieferte Bild je anzufassen.

const EXPECTED_WIDTH = 378;
const EXPECTED_HEIGHT = 185;

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

  return { ...header, bytesPerPixel, rawBytes: raw.length };
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

// --- Wird ueberhaupt ein Bild ausgeliefert? ---------------------------------
// Ausschlaggebend ist, was der oeffentliche Kopfbereich einbindet. Solange dort
// die Wortmarke steht, gibt es kein Bild, das kaputt sein koennte — dann darf
// diese Pruefung den Build nicht blockieren, muss den Zustand aber benennen.
const shellSource = await readFile(new URL("../app/components/public-shell.tsx", import.meta.url), "utf8");
const shipsImage = /import\s*\{[^}]*brandLogoDataUri[^}]*\}\s*from\s*"~\/brand-logo-data"/.test(shellSource);

if (shipsImage) {
  const indexSource = await readFile(new URL("../app/brand-logo-data/index.ts", import.meta.url), "utf8");
  const uriMatch = indexSource.match(/export const brandLogoDataUri = "data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)";/);
  if (!uriMatch) fail("app/brand-logo-data/index.ts hat ein unerwartetes Format.");

  const shippedType = uriMatch[1];
  const shipped = Buffer.from(uriMatch[2], "base64");
  if (shipped.length < 1000) fail("Das ausgelieferte Logo ist unerwartet klein.");

  const info = shippedType === "png"
    ? inspectPng(shipped, "Ausgeliefertes Logo")
    : inspectJpeg(shipped, "Ausgeliefertes Logo");

  if (info.width !== EXPECTED_WIDTH || info.height !== EXPECTED_HEIGHT) {
    fail(`Ausgeliefertes Logo hat ${info.width}x${info.height}, erwartet waren ${EXPECTED_WIDTH}x${EXPECTED_HEIGHT}.`);
  }

  console.log(
    `Ausgeliefertes Logo geprüft: ${shippedType.toUpperCase()} ${info.width}x${info.height}, ${shipped.length} Bytes`
    + `${shippedType === "png" ? `, ${info.rawBytes} Bytes entpackt` : `, ${info.scanBytes} Bytes Bilddaten`}.`,
  );
} else {
  console.log("Kein Bildlogo eingebunden: der öffentliche Kopfbereich zeigt die Wortmarke.");
}

// --- Zustand der abgelegten Logodateien -------------------------------------
// Beide Fassungen im Repository sind beschädigt. Das wird bei jedem Lauf
// benannt, damit es nicht in Vergessenheit gerät — der Build bricht deswegen
// nicht ab, solange kein beschädigtes Bild ausgeliefert wird.
async function describeStoredAsset() {
  const partFiles = ["part1.ts", "part1-tail.ts", "part2.ts", "part3.ts", "part4.ts", "part5.ts", "part6.ts", "part7.ts", "part8.ts"];
  const parts = [];
  for (const file of partFiles) {
    const source = await readFile(new URL(`../app/brand-logo-data/${file}`, import.meta.url), "utf8");
    const match = source.match(/^export default "([A-Za-z0-9+/=]+)";\s*$/);
    if (!match) return `Brand-Logo-Teil ${file} hat ein unerwartetes Format.`;
    parts.push(match[1]);
  }
  try {
    const spare = Buffer.from(parts.join(""), "base64");
    const info = inspectPng(spare, "Abgelegte PNG-Fassung");
    return `Abgelegte PNG-Fassung ist intakt: ${info.width}x${info.height}, ${info.rawBytes} Bytes entpackt.`;
  } catch (error) {
    return error.message;
  }
}

const storedState = await describeStoredAsset();
if (storedState.includes("intakt")) {
  console.log(storedState);
} else {
  console.warn(`HINWEIS: ${storedState} Solange keine unbeschädigte Originaldatei vorliegt, bleibt die Wortmarke im Kopfbereich.`);
}
