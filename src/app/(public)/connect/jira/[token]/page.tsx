import { redirect } from "next/navigation";
import { appPath } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { signOAuthState } from "@/lib/oauth-state";
import { buildJiraAuthorizeUrl, getJiraOAuthConfig, JIRA_OAUTH_SCOPES } from "@/lib/jira-oauth";
import {
  ConnectInviteError,
  loadActiveInviteByToken,
} from "@/lib/integration-connect-invite";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function JiraConnectEntryPage({ params }: PageProps) {
  const { token } = await params;

  try {
    const invite = await loadActiveInviteByToken(token, "JIRA");

    const connectedIntegration = await prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId: invite.organizationId,
          provider: "JIRA",
        },
      },
      select: { status: true },
    });

    if (connectedIntegration?.status === "CONNECTED") {
      redirect(appPath("/connect/error?code=already_connected&provider=jira"));
    }

    const { configured } = getJiraOAuthConfig("external");
    if (!configured) {
      redirect(appPath("/connect/error?code=config_missing&provider=jira"));
    }

    const state = await signOAuthState({
      flow: "external",
      organizationId: invite.organizationId,
      inviteId: invite.id,
      provider: "JIRA",
      createdById: invite.createdById,
    });

    const authorizeUrl = buildJiraAuthorizeUrl(state, "external");

    return (
      <>
        <div className="mb-4 rounded-md border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Set up integration on behalf of customer
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Connect Jira to {invite.organization.name}</CardTitle>
            <CardDescription>
              Authorize read-only access so your AIDOS team can sync delivery intelligence.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-secondary">
              You are connecting Jira Cloud to <strong>{invite.organization.name}</strong> on AIDOS.
              When Atlassian asks which site to grant, select the Jira site for this organization.
            </p>

            <div className="rounded-lg border border-border bg-elevated/40 p-3">
              <p className="text-xs font-medium text-primary">Read-only scopes</p>
              <ul className="mt-2 space-y-1 text-xs text-muted">
                {JIRA_OAUTH_SCOPES.filter((s) => s !== "offline_access").map((scope) => (
                  <li key={scope}>{scope}</li>
                ))}
              </ul>
            </div>

            <Button asChild className="w-full">
              <a href={authorizeUrl}>Continue to Atlassian</a>
            </Button>

            <p className="text-center text-[11px] text-muted">
              No AIDOS account required. This link expires in 24 hours and can only be used once.
            </p>
          </CardContent>
        </Card>
      </>
    );
  } catch (err) {
    if (err instanceof ConnectInviteError) {
      redirect(appPath(`/connect/error?code=${err.code}&provider=jira`));
    }
    throw err;
  }
}
