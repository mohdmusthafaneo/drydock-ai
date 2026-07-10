import fs from "node:fs/promises";
import { getCacheClient } from "@/lib/cache";

type CacheEntry = {
  mtimeMs: number;
  content: string;
};

function promptCacheKey(filePath: string): string {
  return `prompt-file:${filePath}`;
}

/** Read a file with mtime-based cache (shared via CacheClient when Valkey is set). */
export async function readCachedUtf8File(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  const cache = getCacheClient();
  const key = promptCacheKey(filePath);
  const raw = await cache.get(key);
  if (raw) {
    try {
      const cached = JSON.parse(raw) as CacheEntry;
      if (cached.mtimeMs === stat.mtimeMs) {
        return cached.content;
      }
    } catch {
      // fall through
    }
  }

  const content = await fs.readFile(filePath, "utf8");
  await cache.set(
    key,
    JSON.stringify({ mtimeMs: stat.mtimeMs, content } satisfies CacheEntry),
    3600,
  );
  return content;
}

/** Clear cache entry (tests or hot reload). */
export async function clearPromptCache(filePath?: string): Promise<void> {
  const cache = getCacheClient();
  if (filePath) {
    await cache.del(promptCacheKey(filePath));
    return;
  }
  // Full clear is memory-only; Valkey keys expire via TTL.
}
