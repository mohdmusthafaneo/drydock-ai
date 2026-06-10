import fs from "node:fs/promises";

type CacheEntry = {
  mtimeMs: number;
  content: string;
};

const fileCache = new Map<string, CacheEntry>();

/** Read a file with mtime-based in-memory cache (Paperclip prompt-cache pattern, simplified). */
export async function readCachedUtf8File(filePath: string): Promise<string> {
  const stat = await fs.stat(filePath);
  const cached = fileCache.get(filePath);
  if (cached && cached.mtimeMs === stat.mtimeMs) {
    return cached.content;
  }

  const content = await fs.readFile(filePath, "utf8");
  fileCache.set(filePath, { mtimeMs: stat.mtimeMs, content });
  return content;
}

/** Clear cache (tests or hot reload). */
export function clearPromptCache(): void {
  fileCache.clear();
}
