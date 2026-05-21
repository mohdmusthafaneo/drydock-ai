#!/usr/bin/env node
/**
 * Applies manifest local URLs + performance fixes to public/portkey.html.
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "public", "portkey.html");
const manifestPath = path.join(root, "public", "marketing", "manifest.json");

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function applyManifest(html, manifest) {
  let result = html;

  for (const [remote, local] of Object.entries(manifest.cfassets)) {
    if (remote.startsWith("#")) {
      result = result.replaceAll(remote, local);
      continue;
    }
    const full = `https://cfassets.portkey.ai/${remote}`;
    result = result.replaceAll(full, local);
  }

  for (const [remote, local] of Object.entries(manifest.framer)) {
    result = result.replaceAll(remote, local);
    result = result.replaceAll(remote.replace(/&/g, "&amp;"), local);
    result = result.replace(
      new RegExp(`${escapeRegExp(remote)}(?:\\?[^"'\\s>]*)?`, "g"),
      local,
    );
  }

  // Repair any remaining broken cfassets fragments (#SITE%2FHOME%20PAGE%2F...).
  result = result.replace(/#SITE%2F([^"'\\s>]+)/g, (_, encoded) => {
    const local =
      manifest.cfassets[encoded] ||
      manifest.cfassets[`#SITE%2F${encoded}`] ||
      manifest.cfassets[decodeURIComponent(encoded)];
    return local || "#";
  });

  return result;
}

function applyPerformanceFixes(html) {
  let result = html;

  // Cookie banner: run once instead of polling every 250ms.
  result = result.replace(
    /window\.__hideFramerCookieBanner\(\);setInterval\(window\.__hideFramerCookieBanner,250\);/,
    "window.__hideFramerCookieBanner();document.addEventListener('DOMContentLoaded',window.__hideFramerCookieBanner);",
  );

  // AIDOS copy overrides: one delayed pass only (no polling).
  result = result.replace(
    /applyAidosCopy\(\);\s*setTimeout\(applyAidosCopy,\s*250\);\s*setTimeout\(applyAidosCopy,\s*1000\);\s*setTimeout\(applyAidosCopy,\s*2500\);\s*setInterval\(applyAidosCopy,\s*2000\);/,
    "applyAidosCopy();\n  setTimeout(applyAidosCopy, 400);",
  );

  // CTA routing: once on load + short retry only.
  result = result.replace(
    /routeCtas\(\);\s*setTimeout\(routeCtas, 300\);\s*setTimeout\(routeCtas, 1200\);\s*setInterval\(routeCtas, 2000\);/,
    "routeCtas();\n  setTimeout(routeCtas, 300);\n  setTimeout(routeCtas, 1200);",
  );

  if (!result.includes("<!-- aidos-landing-built -->")) {
    result = result.replace(/<!doctype html>/i, "<!doctype html>\n<!-- aidos-landing-built -->");
  }

  return result;
}

async function sanitizeViaTsx(html) {
  const { spawnSync } = await import("node:child_process");
  const { mkdtemp, writeFile, readFile, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const dir = await mkdtemp(path.join(tmpdir(), "aidos-landing-"));
  const inFile = path.join(dir, "in.html");
  const outFile = path.join(dir, "out.html");
  const runnerFile = path.join(dir, "sanitize.ts");
  await writeFile(inFile, html, "utf8");
  await writeFile(
    runnerFile,
    `import { readFile, writeFile } from "node:fs/promises";
import { sanitizeLandingHtml } from "${path.join(root, "src/lib/sanitize-landing-html.ts")}";
async function run() {
  const html = await readFile("${inFile}", "utf8");
  await writeFile("${outFile}", sanitizeLandingHtml(html), "utf8");
}
run().catch((e) => { console.error(e); process.exit(1); });
`,
    "utf8",
  );
  const result = spawnSync("npx", ["--yes", "tsx", runnerFile], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    await rm(dir, { recursive: true, force: true });
    throw new Error(result.stderr || result.stdout || "sanitize failed");
  }
  const out = await readFile(outFile, "utf8");
  await rm(dir, { recursive: true, force: true });
  return out;
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const before = await readFile(htmlPath, "utf8");
  let html = applyManifest(before, manifest);
  html = applyPerformanceFixes(html);
  html = await sanitizeViaTsx(html);
  if (!html.includes("<!-- aidos-landing-built -->")) {
    html = html.replace(/<!doctype html>/i, "<!doctype html>\n<!-- aidos-landing-built -->");
  }
  await writeFile(htmlPath, html, "utf8");
  console.log(`Patched portkey.html (${before.length} -> ${html.length} bytes)`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
