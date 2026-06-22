import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { syncJiraIntegration } from "@/lib/jira-sync";
import { JiraApiError, recordJiraIntegrationFailure } from "@/lib/jira-api";

const bodySchema = z
  .object({
    projectKeys: z.array(z.string().min(1)).optional(),
  })
  .optional();

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
  try {
    const raw = await request.json().catch(() => undefined);
    const parsed = bodySchema.parse(raw);
    projectKeys = parsed?.projectKeys;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  try {
    const result = await syncJiraIntegration({
      organizationId: session.organizationId,
      userId: session.userId,
      projectKeys,
    });
    return NextResponse.json({
      ok: true,
      summary: result.summary,
      syncedAt: result.syncedAt,
      projectCount: result.projectCount,
    });
  } catch (e) {
    const message = await recordJiraIntegrationFailure(session.organizationId, e);

    if (e instanceof JiraApiError) {
      return NextResponse.json({ error: message }, { status: e.status === 401 ? 401 : 502 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
