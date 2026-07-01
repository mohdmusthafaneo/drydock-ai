import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  isAcknowledgedFinding,
  isDismissedFinding,
} from "@/lib/compliance/mutate-finding";
import {
  complianceRecommendationTitle,
  loadPendingComplianceFindingIds,
  parseComplianceFindingIdFromTitle,
} from "@/lib/compliance/recommendation-keys";

describe("compliance recommendation keys", () => {
  it("round-trips finding id in title", () => {
    const title = complianceRecommendationTitle("finding-1", "Fix review gap");
    assert.equal(parseComplianceFindingIdFromTitle(title), "finding-1");
    assert.equal(parseComplianceFindingIdFromTitle("Unrelated title"), null);
  });
});

describe("compliance finding manual state", () => {
  it("detects dismissed findings", () => {
    assert.equal(
      isDismissedFinding(JSON.stringify({ manualAction: "dismiss" })),
      true,
    );
    assert.equal(
      isDismissedFinding(JSON.stringify({ manualAction: "resolve" })),
      false,
    );
  });

  it("detects acknowledged findings", () => {
    assert.equal(
      isAcknowledgedFinding(JSON.stringify({ acknowledgedAt: "2026-06-30T12:00:00.000Z" })),
      true,
    );
    assert.equal(isAcknowledgedFinding("{}"), false);
  });
});

describe("loadPendingComplianceFindingIds", () => {
  it("exports a loader function", () => {
    assert.equal(typeof loadPendingComplianceFindingIds, "function");
  });
});
