import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const DEFAULT_STORAGE_URL = "file:./.data/mastra/store.db";
const DEFAULT_OBSERVABILITY_PATH = "./.data/mastra/observability.duckdb";

export function resolveMastraStorageUrl(): string {
  return process.env.MASTRA_STORAGE_URL?.trim() || DEFAULT_STORAGE_URL;
}

export function resolveMastraObservabilityPath(): string {
  const configured = process.env.MASTRA_OBSERVABILITY_PATH?.trim();
  if (configured) return resolve(configured);
  return resolve(DEFAULT_OBSERVABILITY_PATH);
}

function ensureParentDir(filePath: string): void {
  const dir = dirname(filePath);
  if (dir && dir !== ".") {
    mkdirSync(dir, { recursive: true });
  }
}

/** Ensure local file-backed storage paths exist before Mastra opens them. */
export function ensureMastraStorageDirs(): void {
  const storageUrl = resolveMastraStorageUrl();
  if (storageUrl.startsWith("file:")) {
    ensureParentDir(resolve(storageUrl.slice("file:".length)));
  }

  ensureParentDir(resolveMastraObservabilityPath());
}
