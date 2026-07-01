import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { analyzeCalibrationSample } from "@/lib/jira-calibration/analyze";
import type { CalibrationSample } from "@/lib/jira-calibration/types";
import {
  mergeCalibrationIntoMapping,
  type ToolchainMapping,
} from "@/lib/toolchain-mapping";

function baseSample(overrides: Partial<CalibrationSample> = {}): CalibrationSample {
  return {
    projectKey: "ACME",
    windowDays: 90,
    fetchedAt: new Date().toISOString(),
    issueCount: 3,
    capped: false,
    aggregates: { closedSprintCount: 12, spilloverCount: 2 },
    issues: [
      {
        key: "ACME-1",
        status: "Done",
        issueType: "Story",
        resolutionDate: new Date().toISOString(),
        labels: [],
        fixVersions: ["v1.0"],
        transitions: [
          { from: "In Progress", to: "Done", at: new Date().toISOString() },
        ],
      },
      {
        key: "ACME-2",
        status: "Blocked",
        issueType: "Bug",
        labels: [],
        fixVersions: [],
        transitions: [{ from: "In Progress", to: "Blocked", at: new Date().toISOString() }],
      },
      {
        key: "ACME-3",
        status: "In Progress",
        issueType: "Story",
        labels: [],
        fixVersions: [],
        assignee: "Alex",
        dueDate: "2020-01-01",
        transitions: [],
      },
    ],
    ...overrides,
  };
}

describe("analyzeCalibrationSample", () => {
  it("infers done and blocked statuses from transitions", () => {
    const observations = analyzeCalibrationSample(baseSample());
    assert.ok(observations.inferredDoneStatusNames.includes("Done"));
    assert.equal(observations.inferredBlockedStatusName, "Blocked");
    assert.equal(observations.methodology, "scrum");
  });

  it("suggests fixVersion release tracking when versions are used", () => {
    const observations = analyzeCalibrationSample(baseSample());
    assert.equal(observations.releaseTrackingEvidence.suggestedMode, "fixVersion");
    assert.ok(observations.releaseTrackingEvidence.fixVersionUsageRate > 0);
  });

  it("computes hygiene baselines from open-like issues", () => {
    const observations = analyzeCalibrationSample(baseSample());
    assert.equal(typeof observations.hygieneBaselines.unassignedRatioP50, "number");
    assert.equal(typeof observations.hygieneBaselines.overdueRatioP50, "number");
  });

  it("computes missingEstimateRatioP50 when estimate flags are present", () => {
    const observations = analyzeCalibrationSample(
      baseSample({
        issues: [
          {
            key: "ACME-1",
            status: "In Progress",
            issueType: "Story",
            labels: [],
            fixVersions: [],
            hasEstimate: false,
            transitions: [],
          },
          {
            key: "ACME-2",
            status: "In Progress",
            issueType: "Story",
            labels: [],
            fixVersions: [],
            hasEstimate: true,
            transitions: [],
          },
        ],
      }),
    );
    assert.equal(observations.hygieneBaselines.missingEstimateRatioP50, 1);
  });

  it("downgrades confidence when sample is capped", () => {
    const observations = analyzeCalibrationSample(
      baseSample({ capped: true, issueCount: 500 }),
    );
    assert.equal(observations.confidence, "low");
    assert.equal(observations.sampleCapped, true);
  });
});

describe("mergeCalibrationIntoMapping", () => {
  it("overlays calibrated done statuses and baselines onto mapping", () => {
    const mapping: ToolchainMapping = {
      jira: {
        methodology: "custom",
        usesSprints: false,
        releaseTracking: "none",
        blockedStatusName: "Blocked",
        bugIssueType: "Bug",
        doneStatusCategory: "Done",
      },
    };

    const merged = mergeCalibrationIntoMapping(mapping, {
      methodology: "scrum",
      usesSprints: true,
      releaseTracking: "fixVersion",
      blockedStatusName: "On Hold",
      doneStatusNames: ["Done", "Closed"],
      doneStatusCategory: "Done",
      hygieneBaselines: { unassignedRatioP50: 0.1, overdueRatioP50: 0.05 },
      confidence: "high",
    }, { calibratedAt: "2026-01-01T00:00:00.000Z", confidence: "high", projectKey: "ACME" });

    assert.deepEqual(merged.jira?.doneStatusNames, ["Done", "Closed"]);
    assert.equal(merged.jira?.blockedStatusName, "On Hold");
    assert.equal(merged.jira?.methodology, "scrum");
    assert.equal(merged.jira?.hygieneBaselines?.unassignedRatioP50, 0.1);
    assert.equal(merged.inferredFrom?.calibrationConfidence, "high");
    assert.equal(merged.jira?.projectOverrides?.ACME?.doneStatusNames?.[0], "Done");
  });
});
