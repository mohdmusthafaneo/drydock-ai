import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";

const schema = z.object({
  provider: z.enum(["GITHUB", "JIRA", "JENKINS", "GRAFANA", "PROMETHEUS", "SLACK"]),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { provider } = schema.parse(await request.json());

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

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
