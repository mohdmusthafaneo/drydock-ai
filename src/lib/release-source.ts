/** Release rows seeded at discovery or synced from Jira carry `metadataJson.source`. */
export type ReleaseSourceMeta = {
  source?: "onboarding_demo" | "jira_sync" | "jira_fixversion_sync" | string;
  projectKey?: string;
};

export function parseReleaseMetadata(json: string | null | undefined): ReleaseSourceMeta {
  try {
    const parsed = JSON.parse(json || "{}") as ReleaseSourceMeta;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

const LEGACY_ONBOARDING_RELEASE_NAME = "Platform onboarding release";

export function isOnboardingDemoRelease(release: {
  name: string;
  metadataJson?: string | null;
}): boolean {
  const meta = parseReleaseMetadata(release.metadataJson);
  if (meta.source === "onboarding_demo") return true;
  // Legacy rows created before metadataJson existed
  return release.name === LEGACY_ONBOARDING_RELEASE_NAME;
}

/** Exclude demo releases and collapse duplicate name+version rows (newest first). */
export function filterPortfolioReleases<
  T extends { name: string; version?: string | null; metadataJson?: string | null; createdAt?: Date },
>(releases: T[]): T[] {
  const filtered = releases.filter((r) => !isOnboardingDemoRelease(r));
  const seen = new Set<string>();
  const deduped: T[] = [];

  for (const release of filtered) {
    const key = `${release.name}::${release.version ?? ""}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(release);
  }

  return deduped;
}
