import {
  buildLifecycleSnapshotFromIssues,
  issuesFromStoredSample,
} from "@/lib/delivery-analysis/lifecycle-compute";
import type { LifecycleIssueSampleStored } from "@/lib/delivery-analysis/lifecycle-types";
import type { LifecycleSnapshot } from "@/lib/delivery-analysis/lifecycle-types";
import type { TimeRange } from "@/lib/delivery-analysis/types";
import type { ToolchainMapping } from "@/lib/toolchain-mapping";

export function resolveLifecycleSnapshot(input: {
  sample?: LifecycleIssueSampleStored | null;
  range: TimeRange;
  projectKey: string | null;
  siteUrl?: string;
  mapping?: ToolchainMapping | null;
  nowIso?: string;
}): LifecycleSnapshot {
  const sample = input.sample;
  if (!sample?.issues?.length) {
    return {
      generatedAt: input.nowIso ?? new Date().toISOString(),
      range: input.range,
      projectKey: input.projectKey,
      siteUrl: input.siteUrl,
      kpis: {
        medianCycleHours: null,
        medianLeadHours: null,
        throughput: 0,
        currentWip: 0,
        agingWipCount: 0,
        agingWipPct: null,
        agingThresholdDays: 7,
        sampleSize: 0,
        sampleCapped: false,
        rangeLabel:
          input.range === "7d"
            ? "Last 7 days"
            : input.range === "90d"
              ? "Last 90 days"
              : "Last 30 days",
      },
      stageRows: [],
      issues: [],
      byPerson: [],
      source: "unavailable",
      unavailableReason:
        "No issue+changelog sample yet. Run Jira calibration on Integrations to populate ticket lifecycle metrics.",
    };
  }

  if (
    input.projectKey &&
    sample.projectKey &&
    input.projectKey !== sample.projectKey
  ) {
    return {
      generatedAt: input.nowIso ?? new Date().toISOString(),
      range: input.range,
      projectKey: input.projectKey,
      siteUrl: input.siteUrl,
      kpis: {
        medianCycleHours: null,
        medianLeadHours: null,
        throughput: 0,
        currentWip: 0,
        agingWipCount: 0,
        agingWipPct: null,
        agingThresholdDays: 7,
        sampleSize: 0,
        sampleCapped: false,
        rangeLabel:
          input.range === "7d"
            ? "Last 7 days"
            : input.range === "90d"
              ? "Last 90 days"
              : "Last 30 days",
      },
      stageRows: [],
      issues: [],
      byPerson: [],
      source: "unavailable",
      unavailableReason: `Lifecycle sample is for ${sample.projectKey}; no sample for ${input.projectKey} yet.`,
    };
  }

  const doneStatusNames = input.mapping?.jira?.doneStatusNames ?? [];
  const blockedStatusName = input.mapping?.jira?.blockedStatusName;

  const issues = issuesFromStoredSample(sample, {
    siteUrl: input.siteUrl,
    nowIso: input.nowIso,
    doneStatusNames,
    blockedStatusName,
  });

  return buildLifecycleSnapshotFromIssues(issues, {
    range: input.range,
    projectKey: input.projectKey ?? sample.projectKey,
    siteUrl: input.siteUrl,
    nowIso: input.nowIso,
    sampleCapped: sample.capped,
    transitionsInferred: false,
    source: "jira_sample",
  });
}
