import { NextResponse } from "next/server";
import { z } from "zod";
import {
  platformWorkerNotConfigured,
  verifyPlatformWorkerRequest,
} from "@/lib/platform-worker-auth";
import { drainWakeupQueue } from "@/lib/agent-control-plane/worker";

const bodySchema = z
  .object({
    organizationId: z.string().min(1).optional(),
  })
  .optional();

/**
 * Platform worker endpoint for external schedulers (cron every 30–60s).
 * Auth: `Authorization: Bearer $PLATFORM_WORKER_SECRET`
 * Body (optional): `{ "organizationId": "..." }` — omit to drain all orgs.
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

  if (process.env.AGENT_WORKER_ENABLED === "false") {
    return NextResponse.json({ ok: true, disabled: true });
  }

  let organizationId: string | undefined;
  try {
    const raw = await request.json().catch(() => undefined);
    const parsed = bodySchema.parse(raw);
    organizationId = parsed?.organizationId;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await drainWakeupQueue(organizationId);

  return NextResponse.json({ ok: true, ...result });
}
