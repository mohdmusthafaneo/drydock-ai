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

    if (provider === "JIRA") {
      return NextResponse.json(
        { error: "Connect Jira via OAuth on the Integrations page" },
        { status: 400 },
      );
    }

    if (provider === "PROMETHEUS") {
      return NextResponse.json(
        { error: "Connect Prometheus on the Integrations page" },
        { status: 400 },
      );
    }

    if (provider === "GRAFANA") {
      return NextResponse.json(
        { error: "Connect Grafana on the Integrations page" },
        { status: 400 },
      );
    }

    await prisma.integration.upsert({
      where: {
        organizationId_provider: {
          organizationId: session.organizationId,
          provider,
        },
      },
      create: {
        organizationId: session.organizationId,
        provider,
        status: "CONNECTED",
        displayName: provider,
        connectedAt: new Date(),
        metadataJson: JSON.stringify({
          mode: "read-only-stub",
          phase: 2,
        }),
      },
      update: {
        status: "CONNECTED",
        connectedAt: new Date(),
        metadataJson: JSON.stringify({
          mode: "read-only-stub",
          phase: 2,
        }),
      },
    });

    await prisma.activityEvent.create({
      data: {
        organizationId: session.organizationId,
        type: "integration.connected",
        title: `${provider} connected`,
        description: "Read-only integration stub activated for MVP",
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
