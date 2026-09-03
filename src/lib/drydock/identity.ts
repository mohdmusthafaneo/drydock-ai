/**
 * Test identity: stableKey + alias helpers.
 * A test is repository + file path + suite path + name; all four change under
 * refactoring. stableKey is the durable handle; aliases reconnect history.
 */

export type TestIdentityParts = {
  repository: string;
  filePath: string;
  suitePath: string;
  name: string;
};

/** Normalize path/name fragments for stable comparison. */
export function normalizeFragment(value: string): string {
  return value
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^\.\//, "")
    .toLowerCase();
}

/**
 * Derive a stable key from normalized identity parts.
 * Format: `{repo}|{file}|{suite}|{name}` — deterministic, reversible enough for aliasing.
 */
export function deriveStableKey(parts: TestIdentityParts): string {
  return [
    normalizeFragment(parts.repository),
    normalizeFragment(parts.filePath),
    normalizeFragment(parts.suitePath),
    normalizeFragment(parts.name),
  ].join("|");
}

/**
 * Fuzzy similarity for rename/move re-linking.
 * Returns 0–1. Below CONFIRM_THRESHOLD, surface for architect confirmation.
 */
export const RELINK_AUTO_THRESHOLD = 0.92;
export const RELINK_CONFIRM_THRESHOLD = 0.75;

export function identitySimilarity(a: TestIdentityParts, b: TestIdentityParts): number {
  const weights = { repository: 0.15, filePath: 0.35, suitePath: 0.2, name: 0.3 };
  let score = 0;
  score += weights.repository * exactOrZero(a.repository, b.repository);
  score += weights.filePath * pathSimilarity(a.filePath, b.filePath);
  score += weights.suitePath * tokenJaccard(a.suitePath, b.suitePath);
  score += weights.name * tokenJaccard(a.name, b.name);
  return Math.min(1, Math.max(0, score));
}

function exactOrZero(a: string, b: string): number {
  return normalizeFragment(a) === normalizeFragment(b) ? 1 : 0;
}

function pathSimilarity(a: string, b: string): number {
  const na = normalizeFragment(a);
  const nb = normalizeFragment(b);
  if (na === nb) return 1;
  const baseA = na.split("/").pop() ?? na;
  const baseB = nb.split("/").pop() ?? nb;
  if (baseA === baseB) return 0.85;
  return tokenJaccard(na.replace(/\//g, " "), nb.replace(/\//g, " "));
}

export function tokenJaccard(a: string, b: string): number {
  const ta = tokenize(a);
  const tb = tokenize(b);
  if (ta.size === 0 && tb.size === 0) return 1;
  if (ta.size === 0 || tb.size === 0) return 0;
  let inter = 0;
  for (const t of ta) if (tb.has(t)) inter += 1;
  const union = ta.size + tb.size - inter;
  return union === 0 ? 0 : inter / union;
}

function tokenize(value: string): Set<string> {
  return new Set(
    normalizeFragment(value)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length > 1),
  );
}

/** Normalize error text into a cluster fingerprint (root-cause unit). */
export function fingerprintError(message: string | null | undefined): string | null {
  if (!message) return null;
  const normalized = message
    .replace(/\d{4,}/g, "#")
    .replace(/0x[0-9a-f]+/gi, "0x#")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()
    .slice(0, 240);
  return normalized || null;
}
