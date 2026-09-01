import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const parts = [];
for (let index = 1; index <= 8; index += 1) {
  const source = await readFile(new URL(`../app/brand-logo-data/part${index}.ts`, import.meta.url), "utf8");
  const match = source.match(/^export default "([A-Za-z0-9+/=]+)";\s*$/);
  if (!match) throw new Error(`Brand logo part ${index} has an unexpected format.`);
  parts.push(match[1]);
}

const expectedPartLengths = [9000, 9000, 9000, 9000, 9000, 9000, 9000, 6216];
const expectedPartHashes = [
  "b337b3031987cea249e82d3e416b21861fba086f0b79cec63f6e1489f2a0aa68",
  "a3db99cd5697a76aa1fea32a360f23cb47329dc8507cac15ea6b7e12c76a50c6",
  "9c7b3e9ca8d2430958aaa25544e14cc1951fdfed8afb43d7e29b72ac04918c38",
  "b850c270265a45f9e1a6ff93cf29200666ba90d4a64528fd0a10a4da652795e4",
  "a476a1f1f6a9f92c27c780da65c4fa262cf63e4504ca71a97937e1c412d83bb5",
  "f6a42cb13ba04553757c33e9bf8c688a3aaa6f1854565f48abddead35cf03b08",
  "5e50fa1dd39f4fba6b0e64ee955e971163292f75451ae6ba5b56d6cb722a1b58",
  "90b2dea3898d44091cf7d55cd1257ab1bdadaf1aa2cd76f2247a5fa2a5ef4e0a",
];

const actualPartLengths = parts.map((part) => part.length);
if (actualPartLengths.some((length, index) => length !== expectedPartLengths[index])) {
  throw new Error(`Unexpected brand logo part lengths: ${actualPartLengths.join(",")}`);
}

const actualPartHashes = parts.map((part) => createHash("sha256").update(part).digest("hex"));
const mismatchedParts = actualPartHashes
  .map((hash, index) => hash === expectedPartHashes[index] ? null : `${index + 1}:${hash}`)
  .filter(Boolean);
if (mismatchedParts.length) {
  throw new Error(`Brand logo part checksum mismatch: ${mismatchedParts.join(" ")}`);
}

const base64 = parts.join("");
if (base64.length !== 69216) throw new Error(`Unexpected brand logo base64 length: ${base64.length}`);

const image = Buffer.from(base64, "base64");
if (image.length !== 51911) throw new Error(`Unexpected brand logo byte length: ${image.length}`);
if (image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") throw new Error("Brand logo is not a valid PNG payload.");
if (image.readUInt32BE(16) !== 378 || image.readUInt32BE(20) !== 185) throw new Error("Unexpected brand logo dimensions.");

const sha256 = createHash("sha256").update(image).digest("hex");
const expectedSha256 = "d87e98626326e245c8088d23ad1b213a007bb7305d5c5bb878f223167849546d";
if (sha256 !== expectedSha256) throw new Error(`Brand logo checksum mismatch: ${sha256}`);

console.log("Brand logo verified: uploaded PNG, 378x185, checksum OK.");
