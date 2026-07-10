import assert from "node:assert/strict";
import { describe, it, beforeEach } from "node:test";
import { MemoryCacheClient } from "./memory";

describe("MemoryCacheClient", () => {
  let cache: MemoryCacheClient;

  beforeEach(() => {
    cache = new MemoryCacheClient();
  });

  it("get/set/del round-trip", async () => {
    await cache.set("k", "v");
    assert.equal(await cache.get("k"), "v");
    await cache.del("k");
    assert.equal(await cache.get("k"), null);
  });

  it("setNx acquires once", async () => {
    assert.equal(await cache.setNx("lock", "1", 60), true);
    assert.equal(await cache.setNx("lock", "2", 60), false);
    assert.equal(await cache.get("lock"), "1");
  });

  it("publish delivers to local subscribers", async () => {
    const seen: string[] = [];
    const unsub = await cache.subscribe("ch", (m) => seen.push(m));
    await cache.publish("ch", "hello");
    assert.deepEqual(seen, ["hello"]);
    await unsub();
  });
});
