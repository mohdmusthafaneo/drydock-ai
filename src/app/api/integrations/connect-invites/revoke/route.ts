import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { revokeConnectInvite } from "@/lib/integration-connect-invite";

const schema = z
  .object({
    provider: z.enum(["GITHUB", "JIRA"]).optional(),
    inviteId: z.string().optional(),
  })
  .refine((data) => data.provider || data.inviteId, {
    message: "provider or inviteId required",
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
    const body = schema.parse(await request.json());
    const revoked = await revokeConnectInvite({
      organizationId: session.organizationId,
      provider: body.provider,
      inviteId: body.inviteId,
      revokedById: session.userId,
    });

    if (!revoked) {
      return NextResponse.json({ error: "No active invite" }, { status: 404 });
    }

    await prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        userId: session.userId,
        action: "integration.connect_invite.revoked",
        entityType: "IntegrationConnectInvite",
        entityId: body.inviteId,
        metadataJson: JSON.stringify({
          provider: body.provider,
          inviteId: body.inviteId,
        }),
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
