import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { syncGitHubIntegration } from "@/lib/github-sync";
import { GitHubApiError } from "@/lib/github-api";

export async function POST() {
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
    const result = await syncGitHubIntegration({
      organizationId: session.organizationId,
      userId: session.userId,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    if (e instanceof GitHubApiError) {
      return NextResponse.json(
        { error: `GitHub API error (${e.status}): ${e.message}` },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Sync failed" },
      { status: 400 },
    );
  }
}
