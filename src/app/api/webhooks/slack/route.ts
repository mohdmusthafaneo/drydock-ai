import { after } from "next/server";
import { NextResponse } from "next/server";

import { getMastra } from "@/mastra";
import { AIDOS_ASSISTANT_ID } from "@/mastra/agents/aidos-assistant";
import { resolveSlackTenant } from "@/lib/slack/tenant";
import { slackRequestTenant } from "@/lib/slack/request-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SlackEnvelope = {
  type?: string;
  challenge?: string;
  team_id?: string;
  enterprise_id?: string;
  is_enterprise_install?: boolean;
  authorizations?: Array<{
    team_id?: string | null;
    enterprise_id?: string | null;
    is_enterprise_install?: boolean;
  }>;
  event?: { type?: string; bot_id?: string; subtype?: string };
};

function extractInstallationId(body: SlackEnvelope): string | null {
  if (body.is_enterprise_install && body.enterprise_id) {
    return body.enterprise_id;
  }
  const auth = body.authorizations?.[0];
  if (auth?.is_enterprise_install && auth.enterprise_id) {
    return auth.enterprise_id;
  }
  return body.team_id ?? auth?.team_id ?? body.enterprise_id ?? null;
}

/**
 * Slack Events API ingress.
 * Static route wins over /api/webhooks/[provider]; middleware already treats
 * /api/webhooks/ as public.
 */
export async function POST(request: Request) {
  const rawBody = await request.text();

  let payload: SlackEnvelope;
  try {
    payload = JSON.parse(rawBody) as SlackEnvelope;
  } catch {
    return NextResponse.json({ error: "Malformed JSON" }, { status: 400 });
  }

  // url_verification must succeed before the adapter is initialized.
  if (payload.type === "url_verification" && payload.challenge) {
    return NextResponse.json({ challenge: payload.challenge });
  }

  const installationId = extractInstallationId(payload);
  if (!installationId) {
    // Ack unknown/malformed envelopes so Slack stops retrying.
    return NextResponse.json({ ok: true });
  }

  const tenant = await resolveSlackTenant(installationId);
  if (!tenant) {
    // Unknown workspace — 200 + no-op (never cross-tenant guess).
    return NextResponse.json({ ok: true });
  }

  const mastra = await getMastra();
  const agent = mastra.getAgent(AIDOS_ASSISTANT_ID);
  const channels = agent?.getChannels?.();
  if (!channels) {
    console.error("[slack webhook] AIDOS assistant channels are not configured");
    return NextResponse.json({ ok: true });
  }

  // Ensure channels are initialized even when Mastra did not boot a server.
  if (typeof channels.initialize === "function") {
    try {
      await channels.initialize(mastra);
    } catch (err) {
      console.error("[slack webhook] channel initialize failed", err);
      return NextResponse.json(
        { error: "Channel initialization failed" },
        { status: 503 },
      );
    }
  }

  const forwarded = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: rawBody,
  });

  const waitUntil = (p: Promise<unknown>) => {
    after(async () => {
      try {
        await p;
      } catch (err) {
        console.error("[slack webhook] background work failed", err);
      }
    });
  };

  return slackRequestTenant.run(tenant, async () => {
    return channels.handleWebhookEvent("slack", forwarded, { waitUntil });
  });
}
