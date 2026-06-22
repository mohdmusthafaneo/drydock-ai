import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import {
  fetchOrgJiraProjects,
  MAX_JIRA_SYNC_PROJECTS,
  saveOrgJiraProjectKeys,
} from "@/lib/jira-project-selection";
import {
  JiraApiError,
  recordJiraIntegrationFailure,
} from "@/lib/jira-api";

const putSchema = z.object({
  projectKeys: z.array(z.string().min(1)).min(1).max(MAX_JIRA_SYNC_PROJECTS),
});

export async function GET() {
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
    const { projects, selectedKeys } = await fetchOrgJiraProjects(session.organizationId);
    return NextResponse.json({
      ok: true,
      projects,
      selectedKeys,
      maxProjects: MAX_JIRA_SYNC_PROJECTS,
    });
  } catch (e) {
    const message = await recordJiraIntegrationFailure(session.organizationId, e);
    if (e instanceof JiraApiError) {
      return NextResponse.json({ error: message }, { status: e.status === 401 ? 401 : 502 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function PUT(request: Request) {
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
    const body = putSchema.parse(await request.json());
    const result = await saveOrgJiraProjectKeys({
      organizationId: session.organizationId,
      userId: session.userId,
      projectKeys: body.projectKeys,
    });
    return NextResponse.json({ ok: true, projectKeys: result.projectKeys });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const message = await recordJiraIntegrationFailure(session.organizationId, e);
    if (e instanceof JiraApiError) {
      return NextResponse.json({ error: message }, { status: e.status === 401 ? 401 : 502 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
