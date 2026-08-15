import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { GitHubApiError } from "@/lib/github-api";
import { introspectGitHubSchema } from "@/lib/github-introspection";
import { parseIntegrationMeta } from "@/lib/integration-meta";
import { inferToolchainMapping } from "@/lib/toolchain-mapping";

import { determineActorType } from "@/lib/audit-helpers";
const bodySchema = z
  .object({
    force: z.boolean().optional(),
  })
  .optional();

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: session.organizationId,
        provider: "GITHUB",
      },
    },
  });

  if (!integration || integration.status !== "CONNECTED") {
    return NextResponse.json({ error: "GitHub is not connected" }, { status: 400 });
  }

  const meta = parseIntegrationMeta(integration.metadataJson);
  return NextResponse.json({
    ok: true,
    snapshot: meta.githubSchemaSnapshot ?? null,
  });
}

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

  let force = false;
  try {
    const raw = await request.json().catch(() => undefined);
    force = bodySchema.parse(raw)?.force ?? false;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const snapshot = await introspectGitHubSchema({
      organizationId: session.organizationId,
      force,
    });

    const [profile, integrations] = await Promise.all([
      prisma.organizationProfile.findUnique({
        where: { organizationId: session.organizationId },
      }),
      prisma.integration.findMany({
        where: { organizationId: session.organizationId },
      }),
    ]);

    const mappingSuggestions = inferToolchainMapping({ profile, integrations });

    await prisma.auditLog.create({
      data: {
        organizationId: session.organizationId,
        userId: session.userId,
        action: "github.schema.introspected",
        entityType: "Integration",
        metadataJson: JSON.stringify({
          repoCount: snapshot.repos.length,
          branchStrategy: snapshot.suggestions.branchStrategy?.value,
        }),
        actorType: determineActorType(session.userId, "github.schema.introspected"),
      },
    });

    return NextResponse.json({
      ok: true,
      snapshot,
      mappingSuggestions,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Introspection failed";
    if (message.includes("recently")) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    if (e instanceof GitHubApiError) {
      return NextResponse.json(
        { error: message },
        { status: e.status === 401 || e.status === 403 ? e.status : 502 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
