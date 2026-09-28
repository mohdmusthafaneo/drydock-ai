import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { appUrl } from "@/lib/app-url";
import { verifyOAuthState, type OAuthState } from "@/lib/oauth-state";
import { completeGitLabOAuthConnection } from "@/lib/gitlab-oauth-connection";
import { ConnectInviteError, loadInviteById } from "@/lib/integration-connect-invite";

function connectError(code: string) {
  return NextResponse.redirect(appUrl(`/connect/error?code=${code}&provider=gitlab`));
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  let oauthState: OAuthState | null = null;
  if (state) {
    try {
      oauthState = await verifyOAuthState(state);
    } catch {
      oauthState = null;
    }
  }

  const externalGitLab =
    oauthState?.flow === "external" && oauthState.provider === "GITLAB"
      ? oauthState
      : null;

  if (error) {
    if (externalGitLab) return connectError("gitlab_denied");
    return NextResponse.redirect(appUrl(`/integrations?error=gitlab_${error}`));
  }

  if (!code || !oauthState) {
    if (externalGitLab) return connectError("callback_failed");
    return NextResponse.redirect(appUrl("/integrations?error=gitlab_missing_params"));
  }

  if (externalGitLab) {
    try {
      const invite = await loadInviteById(externalGitLab.inviteId);
      if (invite.organizationId !== externalGitLab.organizationId) {
        return connectError("invalid");
      }

      const org = await prisma.organization.findUnique({
        where: { id: externalGitLab.organizationId },
        select: { name: true },
      });

      const result = await completeGitLabOAuthConnection({
        organizationId: externalGitLab.organizationId,
        userId: externalGitLab.createdById,
        code,
        via: "external_link",
        inviteId: invite.id,
      });

      const params = new URLSearchParams({
        provider: "gitlab",
        org: org?.name ?? "your organization",
        site: result.baseUrl,
        displayName: result.username,
      });
      return NextResponse.redirect(appUrl(`/connect/done?${params.toString()}`));
    } catch (err) {
      if (err instanceof ConnectInviteError) {
        return connectError(err.code);
      }
      if (err instanceof Error && err.message.includes("refresh token")) {
        return connectError("callback_failed");
      }
      console.error("External GitLab OAuth callback error:", err);
      return connectError("callback_failed");
    }
  }

  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl("/login"));
  }

  if (oauthState.flow !== "session") {
    return NextResponse.redirect(appUrl("/integrations?error=gitlab_invalid_state"));
  }
  if (oauthState.organizationId !== session.organizationId) {
    return NextResponse.redirect(appUrl("/integrations?error=gitlab_org_mismatch"));
  }

  try {
    await completeGitLabOAuthConnection({
      organizationId: session.organizationId,
      userId: session.userId,
      code,
      via: "session",
    });
    return NextResponse.redirect(appUrl("/integrations?connected=gitlab"));
  } catch (err) {
    if (err instanceof Error && err.message.includes("refresh token")) {
      return NextResponse.redirect(appUrl("/integrations?error=gitlab_no_refresh_token"));
    }
    console.error("GitLab OAuth callback error:", err);
    return NextResponse.redirect(appUrl("/integrations?error=gitlab_callback_failed"));
  }
}
