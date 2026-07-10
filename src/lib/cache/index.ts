import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";
import { MemoryCacheClient } from "./memory";
import type { CacheBackend, CacheClient } from "./types";
import { ValkeyCacheClient } from "./valkey";

const log = createLogger({ component: "cache" });

const globalForCache = globalThis as unknown as {
  aidosCacheClient?: CacheClient;
  aidosCacheBackend?: CacheBackend;
};

function resolveValkeyUrl(): string | undefined {
  return (
    process.env.VALKEY_URL?.trim() ||
    getEnv().VALKEY_URL?.trim() ||
    undefined
  );
}

/** Shared cache singleton — Valkey when VALKEY_URL is set, else in-memory. */
export function getCacheClient(): CacheClient {
  if (globalForCache.aidosCacheClient) {
    return globalForCache.aidosCacheClient;
  }

  const url = resolveValkeyUrl();
  if (url) {
    log.info("cache backend: valkey");
    const client = new ValkeyCacheClient(url);
    globalForCache.aidosCacheClient = client;
    globalForCache.aidosCacheBackend = "valkey";
    return client;
  }

  log.info("cache backend: memory");
  const client = new MemoryCacheClient();
  globalForCache.aidosCacheClient = client;
  globalForCache.aidosCacheBackend = "memory";
  return client;
}

export function getCacheBackend(): CacheBackend {
  getCacheClient();
  return globalForCache.aidosCacheBackend ?? "memory";
}

/** Test helper — reset singleton. */
export function resetCacheClientForTests(): void {
  globalForCache.aidosCacheClient = undefined;
  globalForCache.aidosCacheBackend = undefined;
}

export type { CacheClient, CacheBackend } from "./types";
