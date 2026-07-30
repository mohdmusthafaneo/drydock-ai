import type { HealthDimension, HealthDimensionId } from "@/lib/executive-briefing/types";
import type { JiraConnectionState } from "@/lib/executive-briefing/health-score";

export type ScoredHealthDimension = HealthDimension & { missing: false };

export type MissingHealthDimension = {
  id: HealthDimensionId;
  label: string;
  summary: string;
  missing: true;
  href: string;
  actionLabel?: string;
};

export type DisplayHealthDimension = ScoredHealthDimension | MissingHealthDimension;

const DIMENSION_ORDER: HealthDimensionId[] = [
  "release",
  "stability",
  "engineering",
  "momentum",
  "governance",
];

const DIMENSION_LABELS: Record<HealthDimensionId, string> = {
  release: "Release confidence",
  stability: "Operational stability",
  engineering: "Engineering risk",
  momentum: "Delivery momentum",
  governance: "Governance & data trust",
};

const MISSING_SUMMARIES: Record<HealthDimensionId, string> = {
  release: "Register and assess a release to score readiness.",
  stability: "Connect observability to score production health.",
  engineering: "Run QA, DevOps, code health, or productivity agents to score engineering risk.",
  momentum: "Connect Jira to score how fast work is moving.",
  governance: "Connect integrations to verify governance signals.",
};

const MISSING_HREFS: Record<HealthDimensionId, string> = {
  release: "/releases/new",
  stability: "/integrations",
  engineering: "/qa",
  momentum: "/integrations",
  governance: "/integrations",
};

function momentumMissingState(jira?: JiraConnectionState): Pick<MissingHealthDimension, "summary" | "href" | "actionLabel"> {
  if (!jira?.connected) {
    return {
      summary: "Connect Jira to score how fast work is moving.",
      href: "/integrations",
      actionLabel: "Connect Jira",
    };
  }
  if (!jira.projectKeysSelected) {
    return {
      summary: "Jira is connected — select which projects to include in delivery analysis.",
      href: "/integrations",
      actionLabel: "Select projects",
    };
  }
  if (!jira.hasSnapshot) {
    return {
      summary: "Jira is connected — run a sync to load sprint and backlog signals.",
      href: "/integrations",
      actionLabel: "Sync Jira data",
    };
  }
  return {
    summary: MISSING_SUMMARIES.momentum,
    href: MISSING_HREFS.momentum,
    actionLabel: "Set up",
  };
}

/** Always returns five dimension slots so the confidence grid never has a hole. */
export function buildDisplayHealthDimensions(
  dimensions: HealthDimension[],
  jiraConnection?: JiraConnectionState,
): DisplayHealthDimension[] {
  const byId = new Map(dimensions.map((dim) => [dim.id, dim]));

  return DIMENSION_ORDER.map((id) => {
    const scored = byId.get(id);
    if (scored) {
      return { ...scored, missing: false as const };
    }

    if (id === "momentum") {
      const momentum = momentumMissingState(jiraConnection);
      return {
        id,
        label: DIMENSION_LABELS[id],
        summary: momentum.summary,
        missing: true as const,
        href: momentum.href,
        actionLabel: momentum.actionLabel,
      };
    }

    if (id === "engineering") {
      return {
        id,
        label: DIMENSION_LABELS[id],
        summary: MISSING_SUMMARIES[id],
        missing: true as const,
        href: MISSING_HREFS[id],
        actionLabel: "Run agents",
      };
    }

    return {
      id,
      label: DIMENSION_LABELS[id],
      summary: MISSING_SUMMARIES[id],
      missing: true as const,
      href: MISSING_HREFS[id],
      actionLabel: "Set up",
    };
  });
}

export function isScoredDimension(
  dim: DisplayHealthDimension,
): dim is ScoredHealthDimension {
  return !dim.missing;
}
