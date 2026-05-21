import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import {
  buildGitHubAuthorizeUrl,
  getGitHubOAuthConfig,
  signOAuthState,
} from "@/lib/github-oauth";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const { configured } = getGitHubOAuthConfig();
  if (!configured) {
    return NextResponse.redirect(
      new URL("/integrations?error=oauth_not_configured", request.url),
    );
  }

  const state = await signOAuthState({
    organizationId: session.organizationId,
    userId: session.userId,
  });

  return NextResponse.redirect(buildGitHubAuthorizeUrl(state));
}
