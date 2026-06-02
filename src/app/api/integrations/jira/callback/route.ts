import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSession } from "@/lib/session";
import { verifyOAuthState } from "@/lib/oauth-state";
import { buildJiraOAuthMeta } from "@/lib/jira-api";
import { mergeJiraMeta, parseJiraMeta } from "@/lib/jira-meta";
import {
  exchangeJiraCode,
  fetchAccessibleResources,
  fetchJiraMyself,
} from "@/lib/jira-oauth";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const error = url.searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/integrations?error=jira_${error}`, request.url),
    );
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/integrations?error=jira_missing_params", request.url),
    );
  }

  try {
    const oauthState = await verifyOAuthState(state);

    if (oauthState.organizationId !== session.organizationId) {
      return NextResponse.redirect(
        new URL("/integrations?error=jira_org_mismatch", request.url),
      );
    }

    const { accessToken, refreshToken, scope } = await exchangeJiraCode(code);
    const resources = await fetchAccessibleResources(accessToken);

    if (resources.length === 0) {
      throw new Error("No accessible Jira Cloud sites for this account");
    }

    const primaryCloudId = resources[0].id;
    let myself: { accountId: string; displayName: string } | undefined;
    try {
      const profile = await fetchJiraMyself(accessToken, primaryCloudId);
      myself = { accountId: profile.accountId, displayName: profile.displayName };
    } catch {
      // Profile fetch is optional for connection
    }

    const existing = await prisma.integration.findUnique({
      where: {
        organizationId_provider: {
          organizationId: session.organizationId,
          provider: "JIRA",
        },
      },
    });

    const meta = buildJiraOAuthMeta({
      existing: existing ? parseJiraMeta(existing.metadataJson) : undefined,
      accessToken,
      refreshToken,
      scope,
      userId: session.userId,
      resources,
      myself,
    });

    const displayName = meta.siteName ?? meta.siteUrl.replace(/^https?:\/\//, "");

    await prisma.$transaction(async (tx) => {
      await tx.integration.upsert({
        where: {
          organizationId_provider: {
            organizationId: session.organizationId,
            provider: "JIRA",
          },
        },
        create: {
          organizationId: session.organizationId,
          provider: "JIRA",
          status: "CONNECTED",
          displayName,
          connectedAt: new Date(),
          metadataJson: mergeJiraMeta({}, meta),
        },
        update: {
          status: "CONNECTED",
          displayName,
          connectedAt: new Date(),
          lastError: null,
          metadataJson: mergeJiraMeta(
            existing ? parseJiraMeta(existing.metadataJson) : {},
            meta,
          ),
        },
      });

      await tx.activityEvent.create({
        data: {
          organizationId: session.organizationId,
          type: "integration.connected",
          title: "Jira connected via OAuth",
          description: `Linked ${meta.siteUrl} — read-only delivery intelligence`,
          metadataJson: JSON.stringify({ provider: "JIRA", cloudId: meta.cloudId }),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: session.organizationId,
          userId: session.userId,
          action: "integration.jira.connected",
          entityType: "Integration",
          metadataJson: JSON.stringify({ siteUrl: meta.siteUrl, cloudId: meta.cloudId }),
        },
      });
    });

    return NextResponse.redirect(new URL("/integrations?connected=jira", request.url));
  } catch (err) {
    console.error("Jira OAuth callback error:", err);
    return NextResponse.redirect(
      new URL("/integrations?error=jira_callback_failed", request.url),
    );
  }
}
