/**
 * Shared cache / coordination interface.
 * In-memory when VALKEY_URL is unset; Valkey (Redis protocol) when set.
 * Used for GitHub token cache, prompt cache, LLM response cache, and locks.
 */
export interface CacheClient {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
  del(key: string): Promise<void>;
  /** SET key value NX EX ttl — returns true if lock acquired. */
  setNx(key: string, value: string, ttlSec: number): Promise<boolean>;
  /** Publish to a pub/sub channel (no-op for memory backend). */
  publish(channel: string, message: string): Promise<void>;
  /** Subscribe to a channel; returns unsubscribe. Memory backend is local-only. */
  subscribe(
    channel: string,
    handler: (message: string) => void,
  ): Promise<() => Promise<void>>;
}

export type CacheBackend = "memory" | "valkey";
