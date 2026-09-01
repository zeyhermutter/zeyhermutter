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
const actualPartLengths = parts.map((part) => part.length);
if (actualPartLengths.some((length, index) => length !== expectedPartLengths[index])) {
  throw new Error(`Unexpected brand logo part lengths: ${actualPartLengths.join(",")}`);
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
