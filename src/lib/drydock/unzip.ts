/**
 * Minimal ZIP reader for GitHub Actions artifact archives.
 * Handles stored and deflate entries; skips encrypted / data-descriptor entries.
 */

import { inflateRawSync } from "node:zlib";

const LOCAL_FILE = 0x04034b50;
const CENTRAL_DIR = 0x02014b50;

export type ZipTextFile = {
  name: string;
  content: string;
};

function looksLikeReport(name: string): boolean {
  const lower = name.toLowerCase();
  if (lower.endsWith("/")) return false;
  return (
    lower.endsWith(".xml") ||
    lower.endsWith(".json") ||
    lower.includes("junit") ||
    lower.includes("test-results")
  );
}

export function extractTextFilesFromZip(archive: ArrayBuffer | Buffer): ZipTextFile[] {
  const buf = Buffer.isBuffer(archive) ? archive : Buffer.from(archive);
  const files: ZipTextFile[] = [];
  let offset = 0;

  while (offset + 30 <= buf.length) {
    const sig = buf.readUInt32LE(offset);
    if (sig === CENTRAL_DIR) break;
    if (sig !== LOCAL_FILE) break;

    const flags = buf.readUInt16LE(offset + 6);
    const method = buf.readUInt16LE(offset + 8);
    const compressedSize = buf.readUInt32LE(offset + 18);
    const nameLen = buf.readUInt16LE(offset + 26);
    const extraLen = buf.readUInt16LE(offset + 28);
    const nameStart = offset + 30;
    const nameEnd = nameStart + nameLen;
    if (nameEnd + extraLen > buf.length) break;

    const name = buf.toString("utf8", nameStart, nameEnd);
    const dataStart = nameEnd + extraLen;

    if (flags & 0x8) {
      break;
    }

    const dataEnd = dataStart + compressedSize;
    if (dataEnd > buf.length) break;

    const slice = buf.subarray(dataStart, dataEnd);
    offset = dataEnd;

    if (!looksLikeReport(name)) continue;

    let raw: Buffer;
    try {
      if (method === 0) raw = Buffer.from(slice);
      else if (method === 8) raw = inflateRawSync(slice);
      else continue;
    } catch {
      continue;
    }

    files.push({ name, content: raw.toString("utf8") });
  }

  return files;
}

export function isJUnitXml(content: string): boolean {
  const head = content.slice(0, 4000).toLowerCase();
  return (
    head.includes("<testsuite") ||
    head.includes("<testsuites") ||
    head.includes("<testcase")
  );
}
