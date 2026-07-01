import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { runJiraCalibrationForProject } from "@/lib/jira-calibration/run";
import { parseJiraMeta } from "@/lib/jira-meta";
import { prisma } from "@/lib/prisma";

const bodySchema = z.object({
  projectKey: z.string().min(1).max(32).optional(),
  force: z.boolean().optional(),
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
    body = bodySchema.parse(await request.json().catch(() => ({})));
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: session.organizationId,
        provider: "JIRA",
      },
    },
    select: { status: true, metadataJson: true },
  });

  if (!integration || integration.status !== "CONNECTED") {
    return NextResponse.json({ error: "Jira is not connected" }, { status: 400 });
  }

  const projectKeys = parseJiraMeta(integration.metadataJson).projectKeys ?? [];
  if (projectKeys.length === 0) {
    return NextResponse.json({ error: "No Jira projects selected" }, { status: 400 });
  }

  const keys = body.projectKey ? [body.projectKey] : projectKeys;
  if (body.projectKey && !projectKeys.includes(body.projectKey)) {
    return NextResponse.json({ error: "Project not in synced scope" }, { status: 400 });
  }

  const results = await Promise.all(
    keys.map((projectKey) =>
      runJiraCalibrationForProject({
        organizationId: session.organizationId,
        projectKey,
        force: body.force ?? true,
      }),
    ),
  );

  return NextResponse.json({
    ok: true,
    results,
  });
}
