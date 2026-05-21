#!/usr/bin/env node
/**
 * Downloads marketing CDN assets and writes public/marketing/manifest.json.
 * Run: node scripts/build-landing-assets.mjs
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "public", "portkey.html");
const marketingDir = path.join(root, "public", "marketing");
const manifestPath = path.join(marketingDir, "manifest.json");

const CFASSETS_BASE = "https://cfassets.portkey.ai/";

/** Known cfassets paths (apostrophe paths are not matched by naive regex). */
const CFASSETS_PATHS = [
  "WEBSITE%2FHOME%20PAGE%2FHero_Fold%2FObservability.mp4",
  "WEBSITE%2FHOME%20PAGE%2FHomepage%201.svg",
  "WEBSITE%2FHOME%20PAGE%2FTake%20the%20driver's%20seat%20%0D%0Awith%20AI%20Governance%2FStay%20in%20control%20with%20full%20visibility.svg",
  "WEBSITE%2FHOME%20PAGE%2FTake%20the%20driver's%20seat%20%0D%0Awith%20AI%20Governance%2FStay%20in%20control%20with%20full%20visibility%202.svg",
  "WEBSITE%2FHOME%20PAGE%2FTestimonial%20Writers%2F29NQC79rh2uf2lCWGQYSLmNrpYA.avif",
  "WEBSITE%2FHOME%20PAGE%2FTestimonial%20Writers%2FHTsVl3NfgwNZmjb2GyijHpsbY.avif",
  "WEBSITE%2FHOME%20PAGE%2FTestimonial%20Writers%2FrV8CiGcJaKJQwsPrXze6oXrE9g.avif",
  "WEBSITE%2FHOME%20PAGE%2Fbuild.monitor.scale_fold%2FStop%20wasting%20time%20integrating%20models.svg",
];

function slugify(encodedPath) {
  const decoded = decodeURIComponent(encodedPath);
  const base = decoded
    .replace(/^WEBSITE\/HOME PAGE\//i, "")
    .replace(/[/\\]+/g, "-")
    .replace(/['\r\n]+/g, "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase();
  const ext = path.extname(decoded) || "";
  const stem = base.replace(new RegExp(`${ext.replace(".", "\\.")}$`), "") || "asset";
  return `${stem}${ext}`;
}

function hashSlug(url) {
  const hash = createHash("sha1").update(url).digest("hex").slice(0, 10);
  const ext = path.extname(new URL(url).pathname.split("?")[0]) || ".bin";
  return `${hash}${ext}`;
}

async function download(url, dest) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`GET ${url} -> ${response.status}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(path.dirname(dest), { recursive: true });
  await writeFile(dest, buffer);
  return buffer.length;
}

function collectUrls(html) {
  const framer = new Set();
  const re =
    /https:\/\/framerusercontent\.com\/(?:images|assets)\/[A-Za-z0-9._-]+(?:\.[a-z0-9]{2,5})?/gi;
  for (const m of html.matchAll(re)) {
    framer.add(m[0]);
  }
  return { framer: [...framer] };
}

async function main() {
  const html = await readFile(htmlPath, "utf8");
  const { framer } = collectUrls(html);

  let manifest = {
    version: 1,
    cfassets: {},
    framer: {},
    brokenPrefix: "#SITE%2F",
  };
  try {
    manifest = {
      ...manifest,
      ...JSON.parse(await readFile(manifestPath, "utf8")),
    };
  } catch {
    // fresh manifest
  }

  await mkdir(marketingDir, { recursive: true });
  await mkdir(path.join(marketingDir, "cfassets"), { recursive: true });
  await mkdir(path.join(marketingDir, "framer"), { recursive: true });

  console.log(`Downloading ${CFASSETS_PATHS.length} cfassets...`);
  for (const encoded of CFASSETS_PATHS) {
    const url = `${CFASSETS_BASE}${encoded}`;
    const fileName = slugify(encoded);
    const localPath = `/marketing/cfassets/${fileName}`;
    const dest = path.join(root, "public", localPath);
    const bytes = await download(url, dest);
    manifest.cfassets[encoded] = localPath;
    manifest.cfassets[`#SITE%2F${encoded}`] = localPath;
    manifest.cfassets[decodeURIComponent(encoded)] = localPath;
    console.log(`  ${fileName} (${bytes} bytes)`);
  }

  // Hero video alias (legacy path)
  manifest.cfassets["WEBSITE/HOME PAGE/Hero_Fold/Observability.mp4"] =
    manifest.cfassets[CFASSETS_PATHS[0]];

  console.log(`Downloading ${framer.length} framerusercontent assets...`);
  let i = 0;
  for (const url of framer) {
    i += 1;
    const fileName = hashSlug(url);
    const localPath = `/marketing/framer/${fileName}`;
    const dest = path.join(root, "public", localPath);
    try {
      const bytes = await download(url, dest);
      manifest.framer[url] = localPath;
      if (i % 20 === 0 || i === framer.length) {
        console.log(`  ${i}/${framer.length}`);
      }
    } catch (error) {
      console.warn(`  skip ${url}: ${error.message}`);
    }
  }

  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  console.log(`Wrote ${manifestPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
