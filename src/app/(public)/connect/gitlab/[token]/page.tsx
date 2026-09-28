import { redirect } from "next/navigation";
import { appPath } from "@/lib/app-url";
import { prisma } from "@/lib/prisma";
import { signOAuthState } from "@/lib/oauth-state";
import {
  buildGitLabAuthorizeUrl,
  getGitLabOAuthConfig,
  GITLAB_OAUTH_SCOPES,
} from "@/lib/gitlab-oauth";
import {
  ConnectInviteError,
  loadActiveInviteByToken,
} from "@/lib/integration-connect-invite";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type PageProps = {
  params: Promise<{ token: string }>;
};

export default async function GitLabConnectEntryPage({ params }: PageProps) {
  const { token } = await params;

  try {
    const invite = await loadActiveInviteByToken(token, "GITLAB");

    const connectedIntegration = await prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId: invite.organizationId,
          provider: "GITLAB",
        },
      },
      select: { status: true },
    });

    if (connectedIntegration?.status === "CONNECTED") {
      redirect(appPath("/connect/error?code=already_connected&provider=gitlab"));
    }

    if (!getGitLabOAuthConfig().configured) {
      redirect(appPath("/connect/error?code=config_missing&provider=gitlab"));
    }

    const state = await signOAuthState({
      flow: "external",
      organizationId: invite.organizationId,
      inviteId: invite.id,
      provider: "GITLAB",
      createdById: invite.createdById,
    });

    const authorizeUrl = buildGitLabAuthorizeUrl(state);

    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Connect GitLab to {invite.organization.name}</CardTitle>
          <CardDescription>
            Authorize read-only access so DryDock can read repositories for this organization.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-secondary">
            You are connecting GitLab to <strong>{invite.organization.name}</strong>. Use a GitLab
            account that is a member of the repositories this organization should read.
          </p>

          <div className="rounded-lg border border-border bg-elevated/40 p-3">
            <p className="text-xs font-medium text-primary">Read-only scopes</p>
            <ul className="mt-2 space-y-1 text-xs text-muted">
              {GITLAB_OAUTH_SCOPES.map((scope) => (
                <li key={scope}>{scope}</li>
              ))}
            </ul>
          </div>

          <Button asChild className="w-full">
            <a href={authorizeUrl}>Continue to GitLab</a>
          </Button>

          <p className="text-center text-[11px] text-muted">
            No DryDock account required. This link expires in 24 hours and can only be used once.
          </p>
        </CardContent>
      </Card>
    );
  } catch (err) {
    if (err instanceof ConnectInviteError) {
      redirect(appPath(`/connect/error?code=${err.code}&provider=gitlab`));
    }
    throw err;
  }
}
