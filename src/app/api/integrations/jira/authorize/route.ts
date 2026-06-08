import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { signOAuthState } from "@/lib/oauth-state";
import { buildJiraAuthorizeUrl, getJiraOAuthConfig } from "@/lib/jira-oauth";
import { appUrl } from "@/lib/app-url";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl("/login"));
  }

  const { configured } = getJiraOAuthConfig();
  if (!configured) {
    return NextResponse.redirect(appUrl("/integrations?error=jira_oauth_not_configured"));
  }

  const state = await signOAuthState({
    flow: "session",
    organizationId: session.organizationId,
    userId: session.userId,
  });

  return NextResponse.redirect(buildJiraAuthorizeUrl(state));
}
