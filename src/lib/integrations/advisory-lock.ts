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

  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;
    return fn();
  });
}
