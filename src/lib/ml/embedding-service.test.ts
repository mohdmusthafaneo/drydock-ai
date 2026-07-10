import assert from "node:assert/strict";
import { describe, it, afterEach } from "node:test";
import {
  HttpEmbeddingService,
  resetEmbeddingServiceForTests,
} from "./embedding-service";

describe("HttpEmbeddingService", () => {
  afterEach(() => {
    resetEmbeddingServiceForTests();
  });

  it("rejects empty embed/score inputs", async () => {
    const svc = new HttpEmbeddingService("http://example.invalid");
    await assert.rejects(() => svc.embed([]), /at least one/);
    await assert.rejects(() => svc.score("  "), /non-empty/);
  });
});
