import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { signOAuthState } from "@/lib/oauth-state";
import { buildJiraAuthorizeUrl, getJiraOAuthConfig } from "@/lib/jira-oauth";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { configured } = getJiraOAuthConfig();
  if (!configured) {
    return NextResponse.redirect(
      new URL("/integrations?error=jira_oauth_not_configured", request.url),
    );
  }

  const state = await signOAuthState({
    organizationId: session.organizationId,
    userId: session.userId,
  });

  return NextResponse.redirect(buildJiraAuthorizeUrl(state));
}
