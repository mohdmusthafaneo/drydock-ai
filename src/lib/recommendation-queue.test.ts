import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  classifyRecommendationQueue,
  createsApprovalRow,
  isHumanApprovalDecision,
  isLeadershipPendingApproval,
  isSetupRecommendationTitle,
  isSystemDismissal,
} from "@/lib/recommendation-queue";

describe("classifyRecommendationQueue", () => {
  it("marks release-linked rows as RELEASE_GATE", () => {
    assert.equal(
      classifyRecommendationQueue({
        title: "Proceed with caution",
        releaseId: "rel_1",
      }),
      "RELEASE_GATE",
    );
  });

  it("marks discovery setup titles as SETUP", () => {
    assert.equal(
      classifyRecommendationQueue({
        title: "Connect Jira for workflow intelligence",
      }),
      "SETUP",
    );
    assert.equal(
      classifyRecommendationQueue({
        title: "Add Grafana observability connector",
      }),
      "SETUP",
    );
  });

  it("marks agent ops prefixes as OPS", () => {
    assert.equal(
      classifyRecommendationQueue({
        title: "[cloud:abc] Fix IAM",
      }),
      "OPS",
    );
    assert.equal(
      classifyRecommendationQueue({
        title: "[qa-board:PROJ] Unblock board health before release",
      }),
      "OPS",
    );
  });

  it("defaults remaining rows to GOVERNANCE", () => {
    assert.equal(
      classifyRecommendationQueue({
        title: "Tighten approval matrix for prod",
      }),
      "GOVERNANCE",
    );
  });
});

describe("createsApprovalRow", () => {
  it("only RELEASE_GATE and GOVERNANCE create approvals", () => {
    assert.equal(createsApprovalRow("SETUP"), false);
    assert.equal(createsApprovalRow("OPS"), false);
    assert.equal(createsApprovalRow("RELEASE_GATE"), true);
    assert.equal(createsApprovalRow("GOVERNANCE"), true);
  });
});

describe("isSetupRecommendationTitle", () => {
  it("recognizes Grafana connector title", () => {
    assert.equal(isSetupRecommendationTitle("Add Grafana observability connector"), true);
  });
});

describe("isLeadershipPendingApproval", () => {
  it("counts only RELEASE_GATE and GOVERNANCE queues", () => {
    assert.equal(
      isLeadershipPendingApproval({
        decision: null,
        recommendation: { queue: "RELEASE_GATE" },
      }),
      true,
    );
    assert.equal(
      isLeadershipPendingApproval({
        decision: null,
        recommendation: { queue: "OPS" },
      }),
      false,
    );
    assert.equal(
      isLeadershipPendingApproval({
        decision: "APPROVED",
        recommendation: { queue: "GOVERNANCE" },
      }),
      false,
    );
  });
});

describe("isSystemDismissal", () => {
  it("detects systemDismissal payload flag", () => {
    assert.equal(isSystemDismissal({ systemDismissal: true }), true);
    assert.equal(isSystemDismissal({ systemDismissal: false }), false);
    assert.equal(isSystemDismissal("{}"), false);
  });
});

describe("isHumanApprovalDecision", () => {
  it("requires approver and excludes system dismissals", () => {
    assert.equal(
      isHumanApprovalDecision({
        approverId: "user_1",
        payloadJson: {},
      }),
      true,
    );
    assert.equal(
      isHumanApprovalDecision({
        approverId: null,
        payloadJson: {},
      }),
      false,
    );
    assert.equal(
      isHumanApprovalDecision({
        approverId: "user_1",
        payloadJson: { systemDismissal: true },
      }),
      false,
    );
  });
});
