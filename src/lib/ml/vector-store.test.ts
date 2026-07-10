import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cosineSimilarityFromDistance,
  parsePgVector,
  toPgVectorLiteral,
} from "./vector-store";

describe("toPgVectorLiteral", () => {
  it("formats finite floats", () => {
    assert.equal(toPgVectorLiteral([0.1, -0.2, 0]), "[0.1,-0.2,0]");
  });

  it("rejects empty and non-finite", () => {
    assert.throws(() => toPgVectorLiteral([]), /non-empty/);
    assert.throws(() => toPgVectorLiteral([1, Number.NaN]), /non-finite/);
  });
});

describe("parsePgVector", () => {
  it("parses string and array forms", () => {
    assert.deepEqual(parsePgVector("[1,2,3]"), [1, 2, 3]);
    assert.deepEqual(parsePgVector([1, 2, 3]), [1, 2, 3]);
  });
});

describe("cosineSimilarityFromDistance", () => {
  it("maps distance 0 → similarity 1", () => {
    assert.equal(cosineSimilarityFromDistance(0), 1);
    assert.equal(cosineSimilarityFromDistance(0.25), 0.75);
  });
});
