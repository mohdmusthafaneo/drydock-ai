import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { verifyOAuthState } from "@/lib/oauth-state";
import { completeJiraOAuthConnection } from "@/lib/jira-oauth-connection";
import { appUrl } from "@/lib/app-url";

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
    return NextResponse.redirect(appUrl(`/integrations?error=jira_${error}`));
  }

  if (!code || !state) {
    return NextResponse.redirect(appUrl("/integrations?error=jira_missing_params"));
  }

  try {
    const oauthState = await verifyOAuthState(state);

    if (oauthState.flow !== "session") {
      return NextResponse.redirect(appUrl("/integrations?error=jira_invalid_state"));
    }

    if (oauthState.organizationId !== session.organizationId) {
      return NextResponse.redirect(appUrl("/integrations?error=jira_org_mismatch"));
    }

    await completeJiraOAuthConnection({
      organizationId: session.organizationId,
      userId: session.userId,
      code,
      via: "session",
    });

    return NextResponse.redirect(appUrl("/integrations?connected=jira"));
  } catch (err) {
    console.error("Jira OAuth callback error:", err);
    return NextResponse.redirect(appUrl("/integrations?error=jira_callback_failed"));
  }
}
