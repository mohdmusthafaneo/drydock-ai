import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { buildOAuthMeta } from "@/lib/github-api";
import { mergeGitHubMeta, parseIntegrationMeta } from "@/lib/integration-meta";
import {
  exchangeGitHubCode,
  fetchGitHubUser,
} from "@/lib/github-oauth";
import { verifyOAuthState } from "@/lib/oauth-state";
import { appUrl } from "@/lib/app-url";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl("/login"));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(appUrl(`/integrations?error=github_${error}`));
  }

  if (!code || !state) {
    return NextResponse.redirect(appUrl("/integrations?error=github_missing_params"));
  }

  try {
    const oauthState = await verifyOAuthState(state);

    if (oauthState.flow !== "session") {
      return NextResponse.redirect(appUrl("/integrations?error=github_invalid_state"));
    }

    if (oauthState.organizationId !== session.organizationId) {
      return NextResponse.redirect(appUrl("/integrations?error=github_org_mismatch"));
    }

    const { accessToken, scope } = await exchangeGitHubCode(code);
    const githubUser = await fetchGitHubUser(accessToken);

    const existing = await prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId: session.organizationId,
          provider: "GITHUB",
        },
      },
    });

    const meta = buildOAuthMeta({
      existing: existing ? parseIntegrationMeta(existing.metadataJson) : undefined,
      accessToken,
      githubUser,
      scope,
      userId: session.userId,
    });

    await prisma.$transaction(async (tx) => {
      await tx.integration.upsert({
        where: {
          organizationId_provider: {
            organizationId: session.organizationId,
            provider: "GITHUB",
          },
        },
        create: {
          organizationId: session.organizationId,
          provider: "GITHUB",
          status: "CONNECTED",
          displayName: githubUser.login,
          connectedAt: new Date(),
          metadataJson: mergeGitHubMeta(meta, {}),
        },
        update: {
          status: "CONNECTED",
          displayName: githubUser.login,
          connectedAt: new Date(),
          lastError: null,
          metadataJson: mergeGitHubMeta(meta, {}),
        },
      });

      await tx.activityEvent.create({
        data: {
          organizationId: session.organizationId,
          type: "integration.connected",
          title: "GitHub connected via OAuth",
          description: `Linked @${githubUser.login} — sync repositories from Integrations`,
          metadataJson: JSON.stringify({ provider: "GITHUB" }),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          action: "integration.github.connected",
          entityType: "Integration",
          metadataJson: JSON.stringify({ githubLogin: githubUser.login }),
        },
      });
    });

    return NextResponse.redirect(appUrl("/integrations?connected=github&handoff=1"));
  } catch (err) {
    console.error("GitHub OAuth callback error:", err);
    return NextResponse.redirect(appUrl("/integrations?error=github_callback_failed"));
  }
}
