import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { normalizeAnthropicBaseUrlForMastra } from "./models";

describe("normalizeAnthropicBaseUrlForMastra", () => {
  it("appends /v1 to MiniMax anthropic base", () => {
    assert.equal(
      normalizeAnthropicBaseUrlForMastra("https://api.minimax.io/anthropic"),
      "https://api.minimax.io/anthropic/v1",
    );
  });

  it("preserves base that already ends with /v1", () => {
    assert.equal(
      normalizeAnthropicBaseUrlForMastra("https://api.minimax.io/anthropic/v1/"),
      "https://api.minimax.io/anthropic/v1",
    );
  });
});
