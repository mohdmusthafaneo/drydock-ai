import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { parseSlackMeta } from "@/lib/slack-meta";
import { invalidateSlackTenantCache } from "@/lib/slack/tenant";

const schema = z.object({
  provider: z.enum(["GITHUB", "JIRA", "GRAFANA", "PROMETHEUS", "SLACK", "AWS"]),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { provider } = schema.parse(await request.json());

    let slackTeamId: string | undefined;
    if (provider === "SLACK") {
      const existing = await prisma.integration.findUnique({
        where: {
          organizationId_provider: {
            organizationId: session.organizationId,
            provider: "SLACK",
          },
        },
        select: { metadataJson: true },
      });
      slackTeamId = parseSlackMeta(existing?.metadataJson).teamId;
    }

    await prisma.$transaction(async (tx) => {
      await tx.integration.updateMany({
        where: {
          organizationId: session.organizationId,
          provider,
        },
        data: {
          status: "DISCONNECTED",
          displayName: provider,
          connectedAt: null,
          // Clears bot tokens and other secrets from metadata.
          metadataJson: JSON.stringify({ disconnectedAt: new Date().toISOString() }),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          action: `integration.${provider.toLowerCase()}.disconnected`,
          entityType: "Integration",
        },
      });
    });

    if (provider === "SLACK") {
      invalidateSlackTenantCache(slackTeamId);
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
