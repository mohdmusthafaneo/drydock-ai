import { prisma } from "@/lib/prisma";

/**
 * Serialize credential refresh for a given org+provider using Postgres advisory locks.
 * Safe across multiple worker/web processes without Valkey (architecture §2.1).
 */
export async function withCredentialAdvisoryLock<T>(
  organizationId: string,
  provider: string,
  fn: () => Promise<T>,
): Promise<T> {
  const lockKey = `${organizationId}:${provider}`;

  // Token probe/refresh does HTTP inside this lock; default interactive
  // timeout (5s) fails under concurrent Mastra tool calls.
  return prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
      return fn();
    },
    { maxWait: 30_000, timeout: 60_000 },
  );
}
