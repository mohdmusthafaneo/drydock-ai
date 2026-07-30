import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { appUrl } from "@/lib/app-url";
import { verifyOAuthState } from "@/lib/oauth-state";
import { getSession } from "@/lib/session";
import { persistGitHubAppInstallation } from "@/lib/github-app-install";
import {
  loadInviteById,
  ConnectInviteError,
} from "@/lib/integration-connect-invite";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const installationIdRaw = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action") ?? "install";
  const state = url.searchParams.get("state");

  if (!installationIdRaw) {
    return NextResponse.redirect(
      appUrl("/connect/error?code=github_denied&provider=github"),
    );
  }

  const installationId = Number.parseInt(installationIdRaw, 10);
  if (!Number.isFinite(installationId)) {
    return NextResponse.redirect(
      appUrl("/connect/error?code=callback_failed&provider=github"),
    );
  }

  if (!state) {
    return NextResponse.redirect(
      appUrl("/connect/error?code=invalid&provider=github"),
    );
  }

  try {
    const oauthState = await verifyOAuthState(state);

    if (oauthState.flow === "external") {
      if (oauthState.provider !== "GITHUB") {
        return NextResponse.redirect(appUrl("/connect/error?code=invalid&provider=github"));
      }

      const invite = await loadInviteById(oauthState.inviteId);
      if (invite.organizationId !== oauthState.organizationId) {
        return NextResponse.redirect(appUrl("/connect/error?code=invalid&provider=github"));
      }

      const org = await prisma.organization.findUnique({
        where: { id: oauthState.organizationId },
        select: { name: true },
      });

      await persistGitHubAppInstallation({
        organizationId: oauthState.organizationId,
        userId: oauthState.createdById,
        installationId,
        setupAction,
        via: "external_link",
        inviteId: invite.id,
        auditUserId: oauthState.createdById,
      });

      const params = new URLSearchParams({
        provider: "github",
        org: org?.name ?? "your organization",
        installation_id: String(installationId),
      });

      return NextResponse.redirect(appUrl(`/connect/done?${params.toString()}`));
    }

    if (oauthState.flow === "session") {
      const session = await getSession();
      if (!session) {
        return NextResponse.redirect(appUrl("/login"));
      }

      if (oauthState.organizationId !== session.organizationId) {
        return NextResponse.redirect(
          appUrl("/integrations?error=github_org_mismatch"),
        );
      }

      await persistGitHubAppInstallation({
        organizationId: session.organizationId,
        userId: session.userId,
        installationId,
        setupAction,
        via: "session",
      });

      return NextResponse.redirect(appUrl("/integrations?connected=github_app&handoff=1"));
    }

    return NextResponse.redirect(appUrl("/connect/error?code=invalid&provider=github"));
  } catch (err) {
    if (err instanceof ConnectInviteError) {
      return NextResponse.redirect(
        appUrl(`/connect/error?code=${err.code}&provider=github`),
      );
    }
    console.error("[external/github/callback] persist failed:", err);
    return NextResponse.redirect(
      appUrl("/connect/error?code=callback_failed&provider=github"),
    );
  }
}
