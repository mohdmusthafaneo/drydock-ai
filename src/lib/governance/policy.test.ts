import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  mergePolicyConfig,
  resolveGovernancePolicyForProject,
  SYSTEM_DEFAULT_POLICY,
} from "@/lib/governance/policy";

describe("resolveGovernancePolicyForProject", () => {
  it("returns system defaults when policy is null", () => {
    const resolved = resolveGovernancePolicyForProject(null);
    assert.equal(resolved.deploymentThresholds?.minReadinessScore, 70);
    assert.equal(resolved.releaseRules?.requireApprovalForProduction, true);
    assert.equal(resolved.approvalRequirements?.minApprovers, 1);
  });

  it("merges org baseline over system defaults", () => {
    const resolved = resolveGovernancePolicyForProject({
      deploymentThresholds: { minReadinessScore: 80 },
      releaseRules: { requireApprovalForProduction: false },
    });
    assert.equal(resolved.deploymentThresholds?.minReadinessScore, 80);
    assert.equal(resolved.deploymentThresholds?.blockOnCritical, true);
    assert.equal(resolved.releaseRules?.requireApprovalForProduction, false);
  });

  it("applies project override over org baseline", () => {
    const resolved = resolveGovernancePolicyForProject(
      {
        deploymentThresholds: { minReadinessScore: 80, blockOnCritical: true },
        projectOverrides: {
          PROJ: { deploymentThresholds: { minReadinessScore: 90 } },
        },
      },
      "PROJ",
    );
    assert.equal(resolved.deploymentThresholds?.minReadinessScore, 90);
    assert.equal(resolved.deploymentThresholds?.blockOnCritical, true);
  });

  it("falls back to org baseline for unknown project key", () => {
    const resolved = resolveGovernancePolicyForProject(
      {
        deploymentThresholds: { minReadinessScore: 75 },
        projectOverrides: {
          PROJ: { deploymentThresholds: { minReadinessScore: 90 } },
        },
      },
      "OTHER",
    );
    assert.equal(resolved.deploymentThresholds?.minReadinessScore, 75);
  });

  it("mergePolicyConfig deep-merges nested fields", () => {
    const merged = mergePolicyConfig(SYSTEM_DEFAULT_POLICY, {
      deploymentThresholds: { minReadinessScore: 85 },
      approvalRequirements: { minApprovers: 2 },
    });
    assert.equal(merged.deploymentThresholds?.minReadinessScore, 85);
    assert.equal(merged.deploymentThresholds?.blockOnCritical, true);
    assert.equal(merged.approvalRequirements?.minApprovers, 2);
    assert.equal(merged.approvalRequirements?.qaLeadForHighRisk, true);
  });
});
