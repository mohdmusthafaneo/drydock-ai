import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { verifyOAuthState } from "@/lib/oauth-state";
import { completeSlackOAuthConnection } from "@/lib/slack-oauth-connection";
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
    return NextResponse.redirect(appUrl(`/integrations?error=slack_${error}`));
  }

  if (!code || !state) {
    return NextResponse.redirect(appUrl("/integrations?error=slack_missing_params"));
  }

  try {
    const oauthState = await verifyOAuthState(state);

    if (oauthState.flow !== "session") {
      return NextResponse.redirect(appUrl("/integrations?error=slack_invalid_state"));
    }

    if (oauthState.organizationId !== session.organizationId) {
      return NextResponse.redirect(appUrl("/integrations?error=slack_org_mismatch"));
    }

    await completeSlackOAuthConnection({
      organizationId: session.organizationId,
      userId: session.userId,
      code,
      via: "session",
    });

    return NextResponse.redirect(appUrl("/integrations?connected=slack&handoff=1"));
  } catch (err) {
    console.error("Slack OAuth callback error:", err);
    return NextResponse.redirect(appUrl("/integrations?error=slack_callback_failed"));
  }
}
