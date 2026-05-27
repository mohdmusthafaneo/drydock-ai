import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { persistGitHubAppInstallation } from "@/lib/github-app-install";

// Optional callback route — only fires if you set the GitHub App's "Setup URL"
// to /api/integrations/github/app-callback. The default flow points the Setup
// URL at /integrations, which handles the redirect server-side.
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const installationIdRaw = url.searchParams.get("installation_id");
  const setupAction = url.searchParams.get("setup_action") ?? "install";

  if (!installationIdRaw) {
    return NextResponse.redirect(
      new URL("/integrations?error=github_app_missing_installation", request.url),
    );
  }

  const installationId = Number.parseInt(installationIdRaw, 10);
  if (!Number.isFinite(installationId)) {
    return NextResponse.redirect(
      new URL("/integrations?error=github_app_invalid_installation", request.url),
    );
  }

  try {
    await persistGitHubAppInstallation({
      organizationId: session.organizationId,
      userId: session.userId,
      installationId,
      setupAction,
    });
  } catch (err) {
    console.error("[github-app-callback] persist failed:", err);
    return NextResponse.redirect(
      new URL("/integrations?error=github_app_persist_failed", request.url),
    );
  }

  return NextResponse.redirect(
    new URL("/integrations?connected=github_app", request.url),
  );
}
