import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import {
  fetchOrgGitHubRepos,
  MAX_GITHUB_SYNC_REPOS,
  saveOrgGitHubRepoFullNames,
} from "@/lib/github-repo-selection";
import { GitHubApiError, formatGitHubSyncError } from "@/lib/github-api";
import { GithubAppError } from "@/lib/github-app-auth";

const putSchema = z.object({
  repoFullNames: z.array(z.string().min(3)).min(1).max(MAX_GITHUB_SYNC_REPOS),
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
    const { repos, selectedFullNames } = await fetchOrgGitHubRepos(session.organizationId);
    return NextResponse.json({
      ok: true,
      repos,
      selectedFullNames,
      maxRepos: MAX_GITHUB_SYNC_REPOS,
    });
  } catch (e) {
    const message = formatGitHubSyncError(e);
    if (e instanceof GitHubApiError) {
      return NextResponse.json({ error: message }, { status: e.status === 401 ? 401 : 502 });
    }
    if (e instanceof GithubAppError) {
      return NextResponse.json({ error: message }, { status: 502 });
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
    const result = await saveOrgGitHubRepoFullNames({
      organizationId: session.organizationId,
      userId: session.userId,
      repoFullNames: body.repoFullNames,
    });
    return NextResponse.json({ ok: true, repoFullNames: result.repoFullNames });
  } catch (e) {
    if (e instanceof z.ZodError) {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }
    const message = formatGitHubSyncError(e);
    if (e instanceof GitHubApiError) {
      return NextResponse.json({ error: message }, { status: e.status === 401 ? 401 : 502 });
    }
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
