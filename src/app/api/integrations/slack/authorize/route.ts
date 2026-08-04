import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { signOAuthState } from "@/lib/oauth-state";
import { buildSlackAuthorizeUrl, getSlackOAuthConfig } from "@/lib/slack-oauth";
import { appUrl } from "@/lib/app-url";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl("/login"));
  }

  const { configured } = getSlackOAuthConfig();
  if (!configured) {
    return NextResponse.redirect(appUrl("/integrations?error=slack_oauth_not_configured"));
  }

  const state = await signOAuthState({
    flow: "session",
    organizationId: session.organizationId,
    userId: session.userId,
  });

  return NextResponse.redirect(buildSlackAuthorizeUrl(state));
}
