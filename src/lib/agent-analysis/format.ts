function capitalizeFirst(text: string): string {
  if (!text) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Turn `HEAD~20..HEAD` / `origin/main~10..HEAD` into "last N commits". */
export function humanizeRevspec(revspec: string): string {
  const trimmed = revspec.trim();
  const tilde = trimmed.match(/~(\d+)\.\./);
  if (tilde) return `last ${tilde[1]} commits`;
  const nCommits = trimmed.match(/(\d+)\s*commits?/i);
  if (nCommits) return `last ${nCommits[1]} commits`;
  if (/^HEAD$/i.test(trimmed)) return "current HEAD";
  return trimmed.replace(/\.\./g, " → ");
}

/** snake_case / kebab-case / camelCase → readable prose. */
export function humanizeSignalLabel(raw: string): string {
  const spaced = raw
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  return capitalizeFirst(spaced);
}

export function fileBasename(filePath: string): string {
  const parts = filePath.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || filePath;
}

/** Strip technical IDs (sg-*, arn:, 0.0.0.0/0) for executive-facing copy. */
export function sanitizeFindingCopy(text: string): string {
  return text
    .replace(/\s*\(sg-[0-9a-f]+\)/gi, "")
    .replace(/\bsg-[0-9a-f]+\b/gi, "security group")
    .replace(/\barn:aws:[^\s,)]+/gi, "AWS resource")
    .replace(/\b0\.0\.0\.0\/0\b/g, "the public internet")
    .replace(/::\/0/g, "the public internet")
    .replace(/\bor the public internet\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+\./g, ".")
    .trim();
}
