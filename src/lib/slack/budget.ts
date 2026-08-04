import { getCacheClient } from "@/lib/cache";

const DEFAULT_LIMIT = 30;
const WINDOW_SEC = 60 * 60; // 1 hour

/**
 * Per-org rate limit for Slack-originated assistant turns.
 * In-app chat is gated by login; Slack is reachable by any workspace member
 * whose email maps to an AIDOS user, so we add a hard ceiling here.
 */
export async function consumeSlackTurnBudget(organizationId: string): Promise<{
  allowed: boolean;
  remaining: number;
  limit: number;
}> {
  const limit =
    Number(process.env.SLACK_ASSISTANT_HOURLY_LIMIT) > 0
      ? Number(process.env.SLACK_ASSISTANT_HOURLY_LIMIT)
      : DEFAULT_LIMIT;

  const hourBucket = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  const key = `slack:turns:${organizationId}:${hourBucket}`;
  const cache = getCacheClient();

  const currentRaw = await cache.get(key);
  const current = currentRaw ? Number(currentRaw) : 0;
  if (!Number.isFinite(current) || current >= limit) {
    return { allowed: false, remaining: 0, limit };
  }

  const next = current + 1;
  await cache.set(key, String(next), WINDOW_SEC);
  return { allowed: true, remaining: Math.max(0, limit - next), limit };
}
