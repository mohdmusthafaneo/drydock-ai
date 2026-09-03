import assert from "node:assert/strict";
import { test } from "node:test";
import { deflateRawSync } from "node:zlib";
import { extractTextFilesFromZip, isJUnitXml } from "./unzip";

function makeZip(name: string, content: string): Buffer {
  const raw = Buffer.from(content, "utf8");
  const compressed = deflateRawSync(raw);
  const nameBuf = Buffer.from(name, "utf8");
  const header = Buffer.alloc(30);
  header.writeUInt32LE(0x04034b50, 0);
  header.writeUInt16LE(20, 4);
  header.writeUInt16LE(0, 6);
  header.writeUInt16LE(8, 8);
  header.writeUInt32LE(0, 10);
  header.writeUInt32LE(0, 14);
  header.writeUInt32LE(compressed.length, 18);
  header.writeUInt32LE(raw.length, 22);
  header.writeUInt16LE(nameBuf.length, 26);
  header.writeUInt16LE(0, 28);
  const central = Buffer.alloc(4);
  central.writeUInt32LE(0x02014b50, 0);
  return Buffer.concat([header, nameBuf, compressed, central]);
}

test("extractTextFilesFromZip inflates junit xml", () => {
  const xml = `<?xml version="1.0"?><testsuite name="s"><testcase name="a"/></testsuite>`;
  const zip = makeZip("junit.xml", xml);
  const files = extractTextFilesFromZip(zip);
  assert.equal(files.length, 1);
  assert.equal(files[0]?.name, "junit.xml");
  assert.equal(isJUnitXml(files[0]!.content), true);
});
