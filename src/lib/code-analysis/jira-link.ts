/** Escape special regex characters in a Jira project key. */
function escapeRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Extract Jira issue keys from free text, constrained to configured project keys.
 * Keys are normalized to uppercase (e.g. AIDOS-42).
 */
export function extractJiraKeys(text: string, projectKeys: string[]): string[] {
  if (!text?.trim() || projectKeys.length === 0) return [];

  const found = new Set<string>();
  for (const projectKey of projectKeys) {
    const pattern = new RegExp(`\\b${escapeRegex(projectKey)}-(\\d+)\\b`, "gi");
    for (const match of text.matchAll(pattern)) {
      found.add(`${projectKey.toUpperCase()}-${match[1]}`);
    }
  }

  return [...found].sort();
}

/** Merge keys extracted from multiple text sources. */
export function extractJiraKeysFromTexts(
  texts: Array<string | null | undefined>,
  projectKeys: string[],
): string[] {
  const merged = new Set<string>();
  for (const text of texts) {
    if (!text) continue;
    for (const key of extractJiraKeys(text, projectKeys)) {
      merged.add(key);
    }
  }
  return [...merged].sort();
}

const DIFF_EXCERPT_MAX_CHARS = 6000;

/** Build a truncated diff summary from PR file patches for LLM scoring. */
export function buildDiffExcerpt(
  files: Array<{ filename: string; patch?: string; additions: number; deletions?: number }>,
  maxChars = DIFF_EXCERPT_MAX_CHARS,
): string {
  const sorted = [...files].sort((a, b) => b.additions - a.additions);
  let out = "";

  for (const file of sorted) {
    const header = `\n--- ${file.filename} (+${file.additions}${file.deletions != null ? `/-${file.deletions}` : ""}) ---\n`;
    const patch =
      file.patch?.trim() ||
      `(no patch available; ${file.additions} lines added)\n`;

    if (out.length + header.length + patch.length > maxChars) {
      const remaining = maxChars - out.length - header.length;
      if (remaining > 80) {
        out += header + patch.slice(0, remaining) + "\n...[truncated]";
      }
      break;
    }
    out += header + patch;
  }

  return out.trim();
}

export function buildJiraIssueBrowseUrl(siteUrl: string, issueKey: string): string {
  const base = siteUrl.replace(/\/$/, "");
  return `${base}/browse/${issueKey}`;
}
