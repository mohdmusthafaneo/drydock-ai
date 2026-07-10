import Redis from "ioredis";

import type { CacheClient } from "./types";

/**
 * Valkey / Redis-protocol shared cache for multi-replica web.
 * Uses a dedicated subscriber connection for pub/sub.
 */
export class ValkeyCacheClient implements CacheClient {
  private readonly client: Redis;
  private readonly sub: Redis;

  constructor(url: string) {
    this.client = new Redis(url, {
      maxRetriesPerRequest: 2,
      enableReadyCheck: true,
      lazyConnect: false,
    });
    this.sub = new Redis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
    });
  }

  async get(key: string): Promise<string | null> {
    return this.client.get(key);
  }

  async set(key: string, value: string, ttlSec?: number): Promise<void> {
    if (ttlSec !== undefined && ttlSec > 0) {
      await this.client.set(key, value, "EX", ttlSec);
      return;
    }
    await this.client.set(key, value);
  }

  async del(key: string): Promise<void> {
    await this.client.del(key);
  }

  async setNx(key: string, value: string, ttlSec: number): Promise<boolean> {
    const result = await this.client.set(key, value, "EX", ttlSec, "NX");
    return result === "OK";
  }

  async publish(channel: string, message: string): Promise<void> {
    await this.client.publish(channel, message);
  }

  async subscribe(
    channel: string,
    handler: (message: string) => void,
  ): Promise<() => Promise<void>> {
    const listener = (ch: string, message: string) => {
      if (ch === channel) handler(message);
    };
    this.sub.on("message", listener);
    await this.sub.subscribe(channel);
    return async () => {
      this.sub.off("message", listener);
      await this.sub.unsubscribe(channel);
    };
  }

  async quit(): Promise<void> {
    await Promise.allSettled([this.client.quit(), this.sub.quit()]);
  }
}
