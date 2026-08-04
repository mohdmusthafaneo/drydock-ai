import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "ensure-slack-integration" });

/** Ensure every org has a Slack integration row so the Connect card always appears. */
export async function ensureSlackIntegrationRow(organizationId: string): Promise<void> {
  try {
    await prisma.integration.upsert({
      where: {
        organizationId_provider: {
          organizationId,
          provider: "SLACK",
        },
      },
      create: {
        organizationId,
        provider: "SLACK",
        status: "PENDING",
        displayName: "Slack",
      },
      update: {},
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(
      { organizationId, err: message },
      "ensureSlackIntegrationRow failed",
    );
  }
}
