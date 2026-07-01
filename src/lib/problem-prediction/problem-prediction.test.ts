import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  parsePredictionIdFromTitle,
  predictionRecommendationTitle,
} from "@/lib/problem-prediction/recommendation-keys";
import { consecutiveWorsening, linearSlope } from "@/lib/problem-prediction/trends";

describe("problem prediction recommendation keys", () => {
  it("round-trips prediction id in title", () => {
    const title = predictionRecommendationTitle("pred_123", "Delivery slip risk rising");
    assert.equal(parsePredictionIdFromTitle(title), "pred_123");
  });
});

describe("problem prediction trends", () => {
  it("detects negative slope", () => {
    const slope = linearSlope([80, 70, 60]);
    assert.ok(slope < 0);
  });

  it("detects consecutive worsening", () => {
    assert.equal(
      consecutiveWorsening([10, 12, 15], (prev, curr) => curr > prev),
      2,
    );
    assert.equal(
      consecutiveWorsening([10, 9, 8], (prev, curr) => curr > prev),
      0,
    );
  });
});
