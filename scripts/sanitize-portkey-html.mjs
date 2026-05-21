#!/usr/bin/env node
/**
 * Patches public/portkey.html in place. Run: node scripts/sanitize-portkey-html.mjs
 * Requires: npx tsx (installed on demand).
 */
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "public", "portkey.html");

const scriptPath = path.join(root, "scripts", "sanitize-portkey-html.ts");

const result = spawnSync(
  "npx",
  ["--yes", "tsx", scriptPath],
  { cwd: root, encoding: "utf8", stdio: "inherit" },
);

process.exit(result.status ?? 1);
