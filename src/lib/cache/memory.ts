import type { CacheClient } from "./types";

type MemoryEntry = { value: string; expiresAt: number | null };

/**
 * Process-local cache. Safe for single-replica web/worker.
 * Pub/sub is in-process only (same Node process).
 */
export class MemoryCacheClient implements CacheClient {
  private store = new Map<string, MemoryEntry>();
  private subs = new Map<string, Set<(message: string) => void>>();

  async get(key: string): Promise<string | null> {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry.value;
  }

  async set(key: string, value: string, ttlSec?: number): Promise<void> {
    this.store.set(key, {
      value,
      expiresAt:
        ttlSec !== undefined && ttlSec > 0 ? Date.now() + ttlSec * 1000 : null,
    });
  }

  async del(key: string): Promise<void> {
    this.store.delete(key);
  }

  async setNx(key: string, value: string, ttlSec: number): Promise<boolean> {
    const existing = await this.get(key);
    if (existing !== null) return false;
    await this.set(key, value, ttlSec);
    return true;
  }

  async publish(channel: string, message: string): Promise<void> {
    const handlers = this.subs.get(channel);
    if (!handlers) return;
    for (const handler of handlers) {
      try {
        handler(message);
      } catch {
        // ignore subscriber errors
      }
    }
  }

  async subscribe(
    channel: string,
    handler: (message: string) => void,
  ): Promise<() => Promise<void>> {
    let set = this.subs.get(channel);
    if (!set) {
      set = new Set();
      this.subs.set(channel, set);
    }
    set.add(handler);
    return async () => {
      set!.delete(handler);
      if (set!.size === 0) this.subs.delete(channel);
    };
  }

  /** Test helper */
  clear(): void {
    this.store.clear();
    this.subs.clear();
  }
}
