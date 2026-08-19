import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { encryptToken } from "@/lib/token-crypto";
import {
  buildAwsConnectMeta,
  mergeAwsMeta,
  normalizeRoleArn,
  parseAwsMeta,
} from "@/lib/aws-meta";

const bodySchema = z.object({
  roleArn: z.string().min(1),
  /** Required on first connect; optional on update to keep the stored secret. */
  externalId: z.string().min(1).max(256).optional(),
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

  let body: z.infer<typeof bodySchema>;
  try {
    body = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  let roleArn: string;
  try {
    roleArn = normalizeRoleArn(body.roleArn);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Invalid role ARN" },
      { status: 400 },
    );
  }

  const existing = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: session.organizationId,
        provider: "AWS",
      },
    },
  });
  const existingMeta = existing ? parseAwsMeta(existing.metadataJson) : {};

  const externalId = body.externalId?.trim();
  const externalIdEnc = externalId
    ? encryptToken(externalId)
    : existingMeta.externalIdEnc;
  if (!externalIdEnc) {
    return NextResponse.json({ error: "External ID is required" }, { status: 400 });
  }
  const meta = buildAwsConnectMeta({
    existing: existingMeta,
    roleArn,
    externalIdEnc,
    userId: session.userId,
    connectionStatus: "ok",
    lastError: undefined,
  });

  const accountHint = meta.accountIdHint;
  const displayName = accountHint ? `AWS · ${accountHint}` : "AWS account scan";

  await prisma.$transaction(async (tx) => {
    await tx.integration.upsert({
      where: {
        organizationId_provider: {
          organizationId: session.organizationId,
          provider: "AWS",
        },
      },
      create: {
        organizationId: session.organizationId,
        provider: "AWS",
        status: "CONNECTED",
        displayName,
        connectedAt: new Date(),
        lastError: null,
        metadataJson: mergeAwsMeta({}, meta),
      },
      update: {
        status: "CONNECTED",
        displayName,
        connectedAt: existing?.connectedAt ?? new Date(),
        lastError: null,
        metadataJson: mergeAwsMeta(existingMeta, meta),
      },
    });

    await tx.activityEvent.create({
      data: {
        organizationId: session.organizationId,
        type: "integration.connected",
        title: "AWS scan role connected",
        description: `Stored assume-role credentials for ${roleArn}`,
        metadataJson: JSON.stringify({
          provider: "AWS",
          roleArn,
          accountIdHint: accountHint,
        }),
      },
    });

    await tx.auditLog.create({
      data: {
        organizationId: session.organizationId,
        userId: session.userId,
        action: "integration.aws.connected",
        entityType: "Integration",
      },
    });
  });

  return NextResponse.json({
    ok: true,
    roleArn,
    accountIdHint: accountHint,
    connectionStatus: "ok" as const,
  });
}
