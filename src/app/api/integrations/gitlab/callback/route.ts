import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { appUrl } from "@/lib/app-url";
import { verifyOAuthState } from "@/lib/oauth-state";
import { exchangeGitLabCode, getGitLabBaseUrl } from "@/lib/gitlab-oauth";
import { fetchGitLabUser } from "@/lib/gitlab-api";
import { mergeGitLabMeta, parseGitLabMeta } from "@/lib/gitlab-meta";
import { encryptToken } from "@/lib/token-crypto";
import { determineActorType } from "@/lib/audit-helpers";

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
    return NextResponse.redirect(appUrl(`/integrations?error=gitlab_${error}`));
  }

  if (!code || !state) {
    return NextResponse.redirect(appUrl("/integrations?error=gitlab_missing_params"));
  }

  try {
    const oauthState = await verifyOAuthState(state);
    if (oauthState.flow !== "session") {
      return NextResponse.redirect(appUrl("/integrations?error=gitlab_invalid_state"));
    }
    if (oauthState.organizationId !== session.organizationId) {
      return NextResponse.redirect(appUrl("/integrations?error=gitlab_org_mismatch"));
    }

    const tokens = await exchangeGitLabCode(code);
    if (tokens.expiresAt && !tokens.refreshToken) {
      return NextResponse.redirect(appUrl("/integrations?error=gitlab_no_refresh_token"));
    }

    const baseUrl = getGitLabBaseUrl();
    const user = await fetchGitLabUser(tokens.accessToken, baseUrl);

    const existing = await prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId: session.organizationId,
          provider: "GITLAB",
        },
      },
    });

    const meta = mergeGitLabMeta(existing ? parseGitLabMeta(existing.metadataJson) : {}, {
      mode: "oauth",
      baseUrl,
      username: user.username,
      gitlabUserId: user.id,
      name: user.name,
      scope: tokens.scope,
      accessTokenEnc: encryptToken(tokens.accessToken),
      refreshTokenEnc: tokens.refreshToken ? encryptToken(tokens.refreshToken) : undefined,
      accessTokenExpiresAt: tokens.expiresAt,
      connectedBy: session.userId,
    });

    await prisma.$transaction(async (tx) => {
      await tx.integration.upsert({
        where: {
          organizationId_provider: {
            organizationId: session.organizationId,
            provider: "GITLAB",
          },
        },
        create: {
          organizationId: session.organizationId,
          provider: "GITLAB",
          status: "CONNECTED",
          displayName: user.username,
          connectedAt: new Date(),
          metadataJson: meta,
        },
        update: {
          status: "CONNECTED",
          displayName: user.username,
          connectedAt: new Date(),
          lastError: null,
          metadataJson: meta,
        },
      });

      await tx.activityEvent.create({
        data: {
          organizationId: session.organizationId,
          type: "integration.connected",
          title: "GitLab connected via OAuth",
          description: `Linked @${user.username} — read-only access for scripts`,
          metadataJson: JSON.stringify({ provider: "GITLAB", baseUrl }),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          action: "integration.gitlab.connected",
          entityType: "Integration",
          metadataJson: JSON.stringify({
            gitlabUsername: user.username,
            baseUrl,
          }),
          actorType: determineActorType(session.userId, "integration.gitlab.connected"),
        },
      });
    });

    return NextResponse.redirect(appUrl("/integrations?connected=gitlab"));
  } catch (err) {
    console.error("GitLab OAuth callback error:", err);
    return NextResponse.redirect(appUrl("/integrations?error=gitlab_callback_failed"));
  }
}
