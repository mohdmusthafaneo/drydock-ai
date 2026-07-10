import { NextResponse } from "next/server";
import { z } from "zod";
import {
  platformWorkerNotConfigured,
  verifyPlatformWorkerRequest,
} from "@/lib/platform-worker-auth";
import { drainWakeupQueue } from "@/lib/agent-control-plane/worker";
import {
  createLogger,
  resolveCorrelationId,
  runWithCorrelationId,
} from "@/lib/logger";

const bodySchema = z
  .object({
    organizationId: z.string().min(1).optional(),
    wakeupId: z.string().min(1).optional(),
    limit: z.number().int().min(1).max(20).optional(),
  })
  .optional();

/**
 * Platform worker endpoint for external schedulers (cron every 30–60s).
 * Also invoked immediately after enqueueWakeup for event-driven dispatch.
 * Auth: `Authorization: Bearer $PLATFORM_WORKER_SECRET`
 * Body (optional): `{ "organizationId": "...", "wakeupId": "...", "limit": 1 }`
 */
export async function POST(request: Request) {
  const correlationId = resolveCorrelationId(request);

  return runWithCorrelationId(correlationId, async () => {
    const log = createLogger({ route: "api/cron/agents/worker" });

    if (platformWorkerNotConfigured()) {
      return NextResponse.json(
        { error: "Platform worker is not configured (set PLATFORM_WORKER_SECRET)" },
        { status: 503 },
      );
    }

    if (!verifyPlatformWorkerRequest(request)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (process.env.AGENT_WORKER_ENABLED === "false") {
      log.debug("agent worker disabled");
      return NextResponse.json({ ok: true, disabled: true });
    }

    let organizationId: string | undefined;
    let wakeupId: string | undefined;
    let limit: number | undefined;
    try {
      const raw = await request.json().catch(() => undefined);
      const parsed = bodySchema.parse(raw);
      organizationId = parsed?.organizationId;
      wakeupId = parsed?.wakeupId;
      limit = parsed?.limit;
    } catch {
      return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
    }

    const result = await drainWakeupQueue(organizationId, {
      wakeupId,
      limit,
    });

    log.info(
      {
        organizationId,
        wakeupId,
        wakeupsProcessed: result.wakeupsProcessed,
        runsSucceeded: result.runsSucceeded,
        runsFailed: result.runsFailed,
      },
      "agent wakeup drain complete",
    );

    return NextResponse.json({ ok: true, ...result });
  });
}
