import { redirect } from "next/navigation";
import { appPath } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { signOAuthState } from "@/lib/oauth-state";
import {
  ConnectInviteError,
  loadActiveInviteByToken,
} from "@/lib/integration-connect-invite";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function GitHubConnectEntryPage({ params }: PageProps) {
  const { token } = await params;
  const appSlug = process.env.GITHUB_APP_SLUG;

  try {
    const invite = await loadActiveInviteByToken(token, "GITHUB");

    const connectedIntegration = await prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId: invite.organizationId,
          provider: "GITHUB",
        },
      },
      select: { status: true },
    });

    if (connectedIntegration?.status === "CONNECTED") {
      redirect(appPath("/connect/error?code=already_connected&provider=github"));
    }

    if (!appSlug) {
      redirect(appPath("/connect/error?code=config_missing&provider=github"));
    }

    const state = await signOAuthState({
      flow: "external",
      organizationId: invite.organizationId,
      inviteId: invite.id,
      provider: "GITHUB",
      createdById: invite.createdById,
    });

    const installUrl = `https://github.com/apps/${appSlug}/installations/new?state=${encodeURIComponent(state)}`;

    return (
      <>
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Set up integration on behalf of customer
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Install DryDock GitHub App for {invite.organization.name}
            </CardTitle>
            <CardDescription>
              Grant read access to pull requests, commits, and Actions for repositories you select.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-secondary">
              You are installing the DryDock GitHub App for{" "}
              <strong>{invite.organization.name}</strong>. Choose which repositories to grant on
              GitHub — your DryDock administrator will finish setup in the app.
            </p>

            <Button asChild className="w-full">
              <a href={installUrl}>Continue to GitHub</a>
            </Button>

            <p className="text-center text-[11px] text-muted">
              No DryDock account required. This link expires in 24 hours and can only be used once.
            </p>
          </CardContent>
        </Card>
      </>
    );
  } catch (err) {
    if (err instanceof ConnectInviteError) {
      redirect(appPath(`/connect/error?code=${err.code}&provider=github`));
    }
    throw err;
  }
}
