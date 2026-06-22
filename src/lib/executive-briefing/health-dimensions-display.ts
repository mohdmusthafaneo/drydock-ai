import type { HealthDimension, HealthDimensionId } from "@/lib/executive-briefing/types";

export type ScoredHealthDimension = HealthDimension & { missing: false };

export type MissingHealthDimension = {
  id: HealthDimensionId;
  label: string;
  summary: string;
  missing: true;
  href: string;
};

export type DisplayHealthDimension = ScoredHealthDimension | MissingHealthDimension;

const DIMENSION_ORDER: HealthDimensionId[] = [
  "release",
  "stability",
  "momentum",
  "governance",
];

const DIMENSION_LABELS: Record<HealthDimensionId, string> = {
  release: "Release confidence",
  stability: "Operational stability",
  momentum: "Delivery momentum",
  governance: "Governance & data trust",
};

const MISSING_SUMMARIES: Record<HealthDimensionId, string> = {
  release: "Register and assess a release to score readiness.",
  stability: "Connect observability to score production health.",
  momentum: "Connect Jira to score how fast work is moving.",
  governance: "Connect integrations to verify governance signals.",
};

const MISSING_HREFS: Record<HealthDimensionId, string> = {
  release: "/releases/new",
  stability: "/integrations",
  momentum: "/integrations",
  governance: "/integrations",
};

/** Always returns four dimension slots so the confidence grid never has a hole. */
export function buildDisplayHealthDimensions(
  dimensions: HealthDimension[],
): DisplayHealthDimension[] {
  const byId = new Map(dimensions.map((dim) => [dim.id, dim]));

  return DIMENSION_ORDER.map((id) => {
    const scored = byId.get(id);
    if (scored) {
      return { ...scored, missing: false as const };
    }

    return {
      id,
      label: DIMENSION_LABELS[id],
      summary: MISSING_SUMMARIES[id],
      missing: true as const,
      href: MISSING_HREFS[id],
    };
  });
}

export function isScoredDimension(
  dim: DisplayHealthDimension,
): dim is ScoredHealthDimension {
  return !dim.missing;
}
