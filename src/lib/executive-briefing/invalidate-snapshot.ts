import { prisma } from "@/lib/prisma";

/** Fire-and-forget invalidation — never blocks the caller. */
export function invalidateExecutiveBriefingSnapshot(organizationId: string): void {
  void prisma.executiveBriefingSnapshot
    .deleteMany({ where: { organizationId } })
    .catch((error) => {
      console.error(
        `[executive-briefing] failed to invalidate snapshot for org ${organizationId}`,
        error,
      );
    });
}
