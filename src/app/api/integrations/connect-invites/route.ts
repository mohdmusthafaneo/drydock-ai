import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import {
  ConnectInviteError,
  createConnectInvite,
  getActiveConnectInvite,
} from "@/lib/integration-connect-invite";

const createSchema = z.object({
  provider: z.enum(["GITHUB", "JIRA"]),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "integrations", "manage_integrations");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { provider } = createSchema.parse(await request.json());
    const invite = await createConnectInvite({
      organizationId: session.organizationId,
      provider,
      createdById: session.userId,
    });

    await prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        userId: session.userId,
        action: "integration.connect_invite.created",
        entityType: "IntegrationConnectInvite",
        entityId: invite.id,
        metadataJson: JSON.stringify({
          provider,
          inviteId: invite.id,
          expiresAt: invite.expiresAt.toISOString(),
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        provider: invite.provider,
        expiresAt: invite.expiresAt.toISOString(),
        url: invite.url,
      },
    });
  } catch (err) {
    if (err instanceof ConnectInviteError && err.code === "already_connected") {
      return NextResponse.json({ error: "already_connected" }, { status: 409 });
    }
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "integrations", "manage_integrations");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const provider = new URL(request.url).searchParams.get("provider");
  if (provider !== "GITHUB" && provider !== "JIRA") {
    return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  }

  const invite = await getActiveConnectInvite(session.organizationId, provider);
  if (!invite) {
    return NextResponse.json({ ok: true, invite: null });
  }

  return NextResponse.json({
    ok: true,
    invite: {
      id: invite.id,
      provider: invite.provider,
      expiresAt: invite.expiresAt.toISOString(),
      createdAt: invite.createdAt.toISOString(),
      url: invite.url,
    },
  });
}
