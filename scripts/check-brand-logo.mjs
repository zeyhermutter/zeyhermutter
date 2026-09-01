import { readFile } from "node:fs/promises";

const files = [
  "part1.ts",
  "part1-tail.ts",
  "part2.ts",
  "part3.ts",
  "part4.ts",
  "part5.ts",
  "part6.ts",
  "part7.ts",
  "part8.ts",
];

const parts = [];
for (const file of files) {
  const source = await readFile(new URL(`../app/brand-logo-data/${file}`, import.meta.url), "utf8");
  const match = source.match(/^export default "([A-Za-z0-9+/=]+)";\s*$/);
  if (!match) throw new Error(`Brand logo data ${file} has an unexpected format.`);
  parts.push(match[1]);
}

const base64 = parts.join("");
if (base64.length < 1000) throw new Error("Brand logo payload is unexpectedly small.");

const image = Buffer.from(base64, "base64");
if (image.length < 1000) throw new Error("Brand logo image is unexpectedly small.");
if (image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
  throw new Error("Brand logo is not a valid PNG payload.");
}

const width = image.readUInt32BE(16);
const height = image.readUInt32BE(20);
if (width !== 378 || height !== 185) {
  throw new Error(`Unexpected brand logo dimensions: ${width}x${height}`);
}

console.log(`Brand logo verified: PNG ${width}x${height}.`);
