import { prisma } from "@/lib/prisma";
import { enrichExecutiveBriefingForOrg } from "@/lib/executive-briefing/enrich-briefing";

export type ScheduledBriefingEnrichOrgResult = {
  organizationId: string;
  status: "enriched" | "skipped" | "failed";
  reason?: string;
  error?: string;
  generatedAt?: string;
  expiresAt?: string;
};

export async function runScheduledBriefingEnrich(input?: {
  organizationId?: string;
}): Promise<{
  attempted: number;
  enriched: number;
  skipped: number;
  failed: number;
  results: ScheduledBriefingEnrichOrgResult[];
}> {
  const orgs = await prisma.deliveryDNA.findMany({
    where: input?.organizationId
      ? { organizationId: input.organizationId }
      : undefined,
    select: { organizationId: true },
    orderBy: { organizationId: "asc" },
  });

  const results: ScheduledBriefingEnrichOrgResult[] = [];

  for (const org of orgs) {
    const result = await enrichExecutiveBriefingForOrg(org.organizationId);

    if (result.status === "enriched") {
      results.push({
        organizationId: org.organizationId,
        status: "enriched",
        generatedAt: result.generatedAt,
        expiresAt: result.expiresAt,
      });
      continue;
    }

    if (result.status === "skipped") {
      results.push({
        organizationId: org.organizationId,
        status: "skipped",
        reason: result.reason,
      });
      continue;
    }

    results.push({
      organizationId: org.organizationId,
      status: "failed",
      error: result.error,
    });
  }

  return {
    attempted: orgs.length,
    enriched: results.filter((item) => item.status === "enriched").length,
    skipped: results.filter((item) => item.status === "skipped").length,
    failed: results.filter((item) => item.status === "failed").length,
    results,
  };
}
