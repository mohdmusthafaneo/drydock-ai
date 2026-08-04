import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { verifyOAuthState } from "@/lib/oauth-state";
import { completeSlackOAuthConnection } from "@/lib/slack-oauth-connection";
import {
  loadInviteById,
  ConnectInviteError,
} from "@/lib/integration-connect-invite";
import { getSlackOAuthConfig } from "@/lib/slack-oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      appUrl(`/connect/error?code=slack_denied&provider=slack`),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      appUrl("/connect/error?code=callback_failed&provider=slack"),
    );
  }

  const { configured } = getSlackOAuthConfig("external");
  if (!configured) {
    return NextResponse.redirect(
      appUrl("/connect/error?code=config_missing&provider=slack"),
    );
  }

  try {
    const oauthState = await verifyOAuthState(state);
    if (oauthState.flow !== "external" || oauthState.provider !== "SLACK") {
      return NextResponse.redirect(appUrl("/connect/error?code=invalid&provider=slack"));
    }

    const invite = await loadInviteById(oauthState.inviteId);
    if (invite.organizationId !== oauthState.organizationId) {
      return NextResponse.redirect(appUrl("/connect/error?code=invalid&provider=slack"));
    }

    const org = await prisma.organization.findUnique({
      where: { id: oauthState.organizationId },
      select: { name: true },
    });

    const result = await completeSlackOAuthConnection({
      organizationId: oauthState.organizationId,
      userId: oauthState.createdById,
      code,
      via: "external_link",
      oauthFlow: "external",
      inviteId: invite.id,
      auditUserId: oauthState.createdById,
    });

    const params = new URLSearchParams({
      provider: "slack",
      org: org?.name ?? "your organization",
      site: result.meta.teamName ?? result.meta.teamId,
    });

    return NextResponse.redirect(appUrl(`/connect/done?${params.toString()}`));
  } catch (err) {
    if (err instanceof ConnectInviteError) {
      return NextResponse.redirect(
        appUrl(`/connect/error?code=${err.code}&provider=slack`),
      );
    }
    console.error("External Slack OAuth callback error:", err);
    return NextResponse.redirect(
      appUrl("/connect/error?code=callback_failed&provider=slack"),
    );
  }
}
