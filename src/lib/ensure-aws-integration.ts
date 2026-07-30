import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "ensure-aws-integration" });

/**
 * Ensure every org has an AWS integration row so the card always appears.
 * Swallows Prisma enum/client drift so Integrations never 500s the whole page.
 */
export async function ensureAwsIntegrationRow(organizationId: string): Promise<void> {
  try {
    await prisma.integration.upsert({
      where: {
        organizationId_provider: {
          organizationId,
          provider: "AWS",
        },
      },
      create: {
        organizationId,
        provider: "AWS",
        status: "PENDING",
        displayName: "AWS",
      },
      update: {},
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log.warn(
      { organizationId, err: message },
      "ensureAwsIntegrationRow failed — regenerate Prisma client if AWS enum is missing",
    );
  }
}
