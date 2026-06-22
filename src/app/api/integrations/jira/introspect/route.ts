import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { JiraApiError, recordJiraIntegrationFailure } from "@/lib/jira-api";
import {
  clientSafeJiraSchema,
  introspectJiraSchema,
  isJiraSchemaStale,
} from "@/lib/jira-introspection";
import { parseJiraMeta } from "@/lib/jira-meta";
import { inferToolchainMapping } from "@/lib/toolchain-mapping";

const bodySchema = z
  .object({
    projectKeys: z.array(z.string().min(1)).optional(),
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
        provider: "JIRA",
      },
    },
  });

  if (!integration || integration.status !== "CONNECTED") {
    return NextResponse.json({ error: "Jira is not connected" }, { status: 400 });
  }

  const meta = parseJiraMeta(integration.metadataJson);
  const snapshot = meta.jiraSchemaSnapshot;
  const projectKeys = meta.projectKeys ?? [];
  const stale = isJiraSchemaStale(snapshot, projectKeys);

  return NextResponse.json({
    ok: true,
    snapshot: snapshot ? clientSafeJiraSchema(snapshot) : null,
    stale,
    projectKeys,
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

  let projectKeys: string[] | undefined;
  let force = false;
  try {
    const raw = await request.json().catch(() => undefined);
    const parsed = bodySchema.parse(raw);
    projectKeys = parsed?.projectKeys;
    force = parsed?.force ?? false;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const snapshot = await introspectJiraSchema({
      organizationId: session.organizationId,
      projectKeys,
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
        action: "jira.schema.introspected",
        entityType: "Integration",
        metadataJson: JSON.stringify({
          projectKeys: snapshot.projectKeys,
          statusCount: snapshot.statuses.length,
          issueTypeCount: snapshot.issueTypes.length,
        }),
      },
    });

    return NextResponse.json({
      ok: true,
      snapshot: clientSafeJiraSchema(snapshot),
      mappingSuggestions,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Introspection failed";
    if (message.includes("No Jira projects")) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    if (message.includes("recently")) {
      return NextResponse.json({ error: message }, { status: 429 });
    }
    const formatted = await recordJiraIntegrationFailure(session.organizationId, e);
    if (e instanceof JiraApiError) {
      return NextResponse.json(
        { error: formatted },
        { status: e.status === 401 || e.status === 403 ? e.status : 502 },
      );
    }
    return NextResponse.json({ error: formatted }, { status: 400 });
  }
}
