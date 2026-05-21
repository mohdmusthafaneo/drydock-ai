import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseWebhookProvider, receiveWebhook } from "@/lib/webhook-ingest";
import {
  githubWebhookSeverity,
  parseGitHubWebhookEvent,
  verifyGitHubWebhookSignature,
} from "@/lib/github-webhook";
export async function POST(
  request: Request,
  { params }: { params: Promise<{ provider: string }> },
) {
  const { provider: slug } = await params;
  const provider = parseWebhookProvider(slug);
  if (!provider) {
    return NextResponse.json({ error: "Unknown provider" }, { status: 400 });
  }

  const url = new URL(request.url);
  const orgId =
    url.searchParams.get("organizationId") ??
    request.headers.get("x-aidos-organization-id");

  if (!orgId) {
    return NextResponse.json(
      {
        error:
          "Missing organizationId — use ?organizationId=YOUR_ORG_ID in the webhook URL (required for GitHub)",
      },
      { status: 400 },
    );
  }

  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  if (!org) {
    return NextResponse.json({ error: "Organization not found" }, { status: 404 });
  }

  const integration = await prisma.integration.findUnique({
    where: { organizationId_provider: { organizationId: orgId, provider } },
  });
  if (!integration || integration.status !== "CONNECTED") {
    return NextResponse.json({ error: "Integration not connected" }, { status: 409 });
  }

  const rawBody = await request.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = rawBody ? (JSON.parse(rawBody) as Record<string, unknown>) : {};
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (provider === "GITHUB") {
    const secret = process.env.GITHUB_WEBHOOK_SECRET;
    if (secret) {
      const sig = request.headers.get("x-hub-signature-256");
      if (!verifyGitHubWebhookSignature(rawBody, sig, secret)) {
        return NextResponse.json({ error: "Invalid webhook signature" }, { status: 401 });
      }
    }

    const gh = parseGitHubWebhookEvent(request.headers, payload);
    const repo = payload.repository as { full_name?: string } | undefined;
    const enriched = {
      ...payload,
      _aidos: {
        githubEvent: gh.eventType,
        action: gh.action,
        severity: githubWebhookSeverity(
          request.headers.get("x-github-event") ?? "",
          payload,
        ),
        service: repo?.full_name,
      },
    };

    const result = await receiveWebhook({
      organizationId: orgId,
      provider,
      eventType: gh.eventType,
      payload: enriched,
    });

    return NextResponse.json({ ok: true, event: gh.eventType, ...result });
  }

  const eventType = String(payload.action ?? payload.event_type ?? "webhook.received");

  try {
    const result = await receiveWebhook({
      organizationId: orgId,
      provider,
      eventType,
      payload,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Webhook processing failed" },
      { status: 500 },
    );
  }
}
