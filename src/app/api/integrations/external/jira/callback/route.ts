import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { verifyOAuthState } from "@/lib/oauth-state";
import { completeJiraOAuthConnection } from "@/lib/jira-oauth-connection";
import {
  loadInviteById,
  ConnectInviteError,
} from "@/lib/integration-connect-invite";
import { getJiraOAuthConfig } from "@/lib/jira-oauth";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      appUrl(`/connect/error?code=jira_denied&provider=jira`),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      appUrl("/connect/error?code=callback_failed&provider=jira"),
    );
  }

  const { configured } = getJiraOAuthConfig("external");
  if (!configured) {
    return NextResponse.redirect(
      appUrl("/connect/error?code=config_missing&provider=jira"),
    );
  }

  try {
    const oauthState = await verifyOAuthState(state);
    if (oauthState.flow !== "external" || oauthState.provider !== "JIRA") {
      return NextResponse.redirect(appUrl("/connect/error?code=invalid&provider=jira"));
    }

    const invite = await loadInviteById(oauthState.inviteId);
    if (invite.organizationId !== oauthState.organizationId) {
      return NextResponse.redirect(appUrl("/connect/error?code=invalid&provider=jira"));
    }

    const org = await prisma.organization.findUnique({
      where: { id: oauthState.organizationId },
      select: { name: true },
    });

    const result = await completeJiraOAuthConnection({
      organizationId: oauthState.organizationId,
      userId: oauthState.createdById,
      code,
      via: "external_link",
      oauthFlow: "external",
      inviteId: invite.id,
      auditUserId: oauthState.createdById,
    });

    const params = new URLSearchParams({
      provider: "jira",
      org: org?.name ?? "your organization",
      site: result.meta.siteName ?? result.meta.siteUrl,
    });
    if (result.externalDisplayName) {
      params.set("displayName", result.externalDisplayName);
    }

    return NextResponse.redirect(appUrl(`/connect/done?${params.toString()}`));
  } catch (err) {
    if (err instanceof ConnectInviteError) {
      return NextResponse.redirect(
        appUrl(`/connect/error?code=${err.code}&provider=jira`),
      );
    }
    if (err instanceof Error && err.message.includes("No accessible Jira Cloud sites")) {
      return NextResponse.redirect(
        appUrl("/connect/error?code=jira_no_sites&provider=jira"),
      );
    }
    console.error("External Jira OAuth callback error:", err);
    return NextResponse.redirect(
      appUrl("/connect/error?code=callback_failed&provider=jira"),
    );
  }
}
