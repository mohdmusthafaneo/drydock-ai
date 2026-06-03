import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { snapshotForStoredData } from "@/lib/code-analysis/compute-snapshot";
import { syncCodeAnalysis } from "@/lib/code-analysis/sync";
import { GitHubApiError } from "@/lib/github-api";
import { prisma } from "@/lib/prisma";

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
    const result = await syncCodeAnalysis({
      organizationId: session.organizationId,
      userId: session.userId,
    });
    return NextResponse.json({
      ok: true,
      summary: result.summary,
      syncedAt: result.stored.syncedAt,
      snapshot: snapshotForStoredData(result.stored, {
        range: "30d",
        repos: result.stored.repos,
      }),
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Analysis failed";

    await prisma.integration
      .update({
        where: {
          organizationId_provider: {
            organizationId: session.organizationId,
            provider: "GITHUB",
          },
        },
        data: { lastError: message },
      })
      .catch(() => undefined);

    if (e instanceof GitHubApiError) {
      return NextResponse.json(
        { error: `GitHub API error (${e.status}): ${e.message}` },
        { status: 502 },
      );
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
