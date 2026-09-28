import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { buildGitLabAuthorizeUrl, getGitLabOAuthConfig } from "@/lib/gitlab-oauth";
import { signOAuthState } from "@/lib/oauth-state";
import { appUrl } from "@/lib/app-url";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl("/login"));
  }

  const { configured } = getGitLabOAuthConfig();
  if (!configured) {
    return NextResponse.redirect(appUrl("/integrations?error=gitlab_oauth_not_configured"));
  }

  const state = await signOAuthState({
    flow: "session",
    organizationId: session.organizationId,
    userId: session.userId,
  });

  return NextResponse.redirect(buildGitLabAuthorizeUrl(state));
}
