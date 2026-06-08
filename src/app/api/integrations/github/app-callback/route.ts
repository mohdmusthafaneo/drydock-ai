import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { persistGitHubAppInstallation } from "@/lib/github-app-install";
import { appUrl } from "@/lib/app-url";

// Optional callback route — only fires if you set the GitHub App's "Setup URL"
// to /api/integrations/github/app-callback. Prefer the unified external callback
// at /api/integrations/external/github/callback for both session and external flows.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(appUrl("/login"));
  }

  const url = new URL(request.url);
  const installationIdRaw = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action") ?? "install";

  if (!installationIdRaw) {
    return NextResponse.redirect(appUrl("/integrations?error=github_app_missing_installation"));
  }

  const installationId = Number.parseInt(installationIdRaw, 10);
  if (!Number.isFinite(installationId)) {
    return NextResponse.redirect(appUrl("/integrations?error=github_app_invalid_installation"));
  }

  try {
    await persistGitHubAppInstallation({
      organizationId: session.organizationId,
      userId: session.userId,
      installationId,
      setupAction,
      via: "session",
    });
  } catch (err) {
    console.error("[github-app-callback] persist failed:", err);
    return NextResponse.redirect(appUrl("/integrations?error=github_app_persist_failed"));
  }

  return NextResponse.redirect(appUrl("/integrations?connected=github_app"));
}
