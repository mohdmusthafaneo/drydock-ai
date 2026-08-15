import { redirect } from "next/navigation";
import { appPath } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { signOAuthState } from "@/lib/oauth-state";
import {
  buildSlackAuthorizeUrl,
  getSlackOAuthConfig,
  SLACK_BOT_SCOPES,
} from "@/lib/slack-oauth";
import {
  ConnectInviteError,
  loadActiveInviteByToken,
} from "@/lib/integration-connect-invite";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function SlackConnectEntryPage({ params }: PageProps) {
  const { token } = await params;

  try {
    const invite = await loadActiveInviteByToken(token, "SLACK");

    const connectedIntegration = await prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId: invite.organizationId,
          provider: "SLACK",
        },
      },
      select: { status: true },
    });

    if (connectedIntegration?.status === "CONNECTED") {
      redirect(appPath("/connect/error?code=already_connected&provider=slack"));
    }

    const { configured } = getSlackOAuthConfig("external");
    if (!configured) {
      redirect(appPath("/connect/error?code=config_missing&provider=slack"));
    }

    const state = await signOAuthState({
      flow: "external",
      organizationId: invite.organizationId,
      inviteId: invite.id,
      provider: "SLACK",
      createdById: invite.createdById,
    });

    const authorizeUrl = buildSlackAuthorizeUrl(state, "external");

    return (
      <>
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Set up integration on behalf of customer
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">
              Add AIDOS to Slack for {invite.organization.name}
            </CardTitle>
            <CardDescription>
              Install the AIDOS Slack app so your team can ask read-only operational
              questions from Slack.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-secondary">
              You are connecting Slack to <strong>{invite.organization.name}</strong> on
              AIDOS. Choose the workspace that belongs to this organization when Slack
              prompts you.
            </p>

            <div className="rounded-lg border border-border bg-elevated/40 p-3">
              <p className="text-xs font-medium text-primary">Bot scopes</p>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {SLACK_BOT_SCOPES.map((scope) => (
                  <li key={scope}>{scope}</li>
                ))}
              </ul>
            </div>

            <Button asChild className="w-full">
              <a href={authorizeUrl}>Continue to Slack</a>
            </Button>

            <p className="text-center text-[11px] text-muted">
              No AIDOS account required. This link expires in 24 hours and can only be
              used once.
            </p>
          </CardContent>
        </Card>
      </>
    );
  } catch (err) {
    if (err instanceof ConnectInviteError) {
      redirect(appPath(`/connect/error?code=${err.code}&provider=slack`));
    }
    throw err;
  }
}
