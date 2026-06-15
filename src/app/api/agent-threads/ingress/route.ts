import { NextResponse } from "next/server";
import { z } from "zod";

import { handleAgentThreadIngress } from "@/lib/agent-chat/ingress";
import {
  platformWorkerNotConfigured,
  verifyPlatformWorkerRequest,
} from "@/lib/platform-worker-auth";

const ingressSchema = z.object({
  organizationId: z.string().min(1),
  externalSource: z.enum(["slack", "discord", "api"]),
  externalChannelId: z.string().min(1),
  externalThreadId: z.string().min(1),
  authorExternalId: z.string().min(1),
  content: z.string().min(1).max(8000),
  title: z.string().max(200).optional(),
  targetAgentId: z.string().optional(),
});

/**
 * Phase 5.6g — external bot ingress (Slack/Discord/API).
 * Auth: Authorization: Bearer PLATFORM_WORKER_SECRET
 */
export async function POST(request: Request) {
  if (platformWorkerNotConfigured()) {
    return NextResponse.json(
      { error: "Platform worker is not configured (set PLATFORM_WORKER_SECRET)" },
      { status: 503 },
    );
  }

  if (!verifyPlatformWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = ingressSchema.parse(await request.json());
    const result = await handleAgentThreadIngress(body);

    if (!result.ok) {
      return NextResponse.json(
        { error: result.error },
        { status: result.status },
      );
    }

    return NextResponse.json({ ok: true, ...result.data });
  } catch {
    return NextResponse.json({ error: "Invalid ingress payload" }, { status: 400 });
  }
}
