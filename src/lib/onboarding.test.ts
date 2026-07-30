import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  getOnboardingSteps,
  isFirstDecisionMilestoneDone,
  isOrgActivated,
} from "./onboarding";

describe("isFirstDecisionMilestoneDone", () => {
  it("is done when a human already decided", () => {
    assert.equal(
      isFirstDecisionMilestoneDone({
        hasProfile: true,
        hasDna: true,
        hasHealthyIntegration: true,
        hasSuccessfulSync: true,
        hasFirstDecision: true,
        hasPendingLeadershipDecision: true,
      }),
      true,
    );
  });

  it("skips when connect+sync are done and nothing awaits leadership", () => {
    assert.equal(
      isFirstDecisionMilestoneDone({
        hasProfile: true,
        hasDna: true,
        hasHealthyIntegration: true,
        hasSuccessfulSync: true,
        hasFirstDecision: false,
        hasPendingLeadershipDecision: false,
      }),
      true,
    );
  });

  it("stays open when leadership items are pending and no human decision yet", () => {
    assert.equal(
      isFirstDecisionMilestoneDone({
        hasProfile: true,
        hasDna: true,
        hasHealthyIntegration: true,
        hasSuccessfulSync: true,
        hasFirstDecision: false,
        hasPendingLeadershipDecision: true,
      }),
      false,
    );
  });

  it("does not skip before sync/health", () => {
    assert.equal(
      isFirstDecisionMilestoneDone({
        hasProfile: true,
        hasDna: true,
        hasHealthyIntegration: false,
        hasSuccessfulSync: false,
        hasFirstDecision: false,
        hasPendingLeadershipDecision: false,
      }),
      false,
    );
  });
});

describe("getOnboardingSteps", () => {
  it("hides the banner for Connexus-class orgs with no leadership queue", () => {
    const steps = getOnboardingSteps({
      hasProfile: true,
      hasDna: true,
      hasHealthyIntegration: true,
      hasSuccessfulSync: true,
      hasFirstDecision: false,
      hasPendingLeadershipDecision: false,
    });
    assert.ok(steps.every((s) => s.done));
  });
});

describe("isOrgActivated", () => {
  it("requires DNA and a synced delivery source", () => {
    assert.equal(isOrgActivated({ hasDna: true, hasDeliverySourceSynced: true }), true);
    assert.equal(isOrgActivated({ hasDna: true, hasDeliverySourceSynced: false }), false);
    assert.equal(isOrgActivated({ hasDna: false, hasDeliverySourceSynced: true }), false);
  });
});
