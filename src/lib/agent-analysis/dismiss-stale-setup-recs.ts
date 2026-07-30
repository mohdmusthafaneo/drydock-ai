import { prisma } from "@/lib/prisma";

const STALE_SETUP_TITLES = [
  "Enable human-governed recommendation loop",
  "Connect Jira for workflow intelligence",
  "Connect GitHub for change-risk signals",
] as const;

/**
 * Auto-reject setup recommendations that contradict live Integration /
 * Delivery DNA state (e.g. "Connect Jira" while Jira is CONNECTED).
 */
export async function dismissStaleSetupRecommendations(
  organizationId: string,
): Promise<{ dismissed: number }> {
  const [integrations, dna, pending] = await Promise.all([
    prisma.integration.findMany({
      where: { organizationId, status: "CONNECTED" },
      select: { provider: true },
    }),
    prisma.deliveryDNA.findUnique({
      where: { organizationId },
      select: { autonomyMode: true },
    }),
    prisma.recommendation.findMany({
      where: {
        organizationId,
        status: "PENDING",
        title: { in: [...STALE_SETUP_TITLES] },
      },
      select: { id: true, title: true },
    }),
  ]);

  if (pending.length === 0) return { dismissed: 0 };

  const providers = new Set(integrations.map((i) => i.provider));
  const jiraOk = providers.has("JIRA");
  const githubOk = providers.has("GITHUB");
  const autonomyRecommend =
    !dna?.autonomyMode || dna.autonomyMode === "RECOMMEND";

  const toDismiss = pending.filter((rec) => {
    if (rec.title === "Connect Jira for workflow intelligence") return jiraOk;
    if (rec.title === "Connect GitHub for change-risk signals") return githubOk;
    if (rec.title === "Enable human-governed recommendation loop") {
      return autonomyRecommend;
    }
    return false;
  });

  if (toDismiss.length === 0) return { dismissed: 0 };

  const ids = toDismiss.map((r) => r.id);
  await prisma.$transaction([
    prisma.approval.updateMany({
      where: {
        organizationId,
        recommendationId: { in: ids },
        decision: null,
      },
      data: {
        decision: "REJECTED",
        comment: "Auto-dismissed — integration/DNA already satisfies this setup item",
        decidedAt: new Date(),
      },
    }),
    prisma.recommendation.updateMany({
      where: { id: { in: ids } },
      data: { status: "REJECTED" },
    }),
  ]);

  return { dismissed: ids.length };
}
