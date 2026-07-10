import { NextResponse } from "next/server";
import {
  platformWorkerNotConfigured,
  verifyPlatformWorkerRequest,
} from "@/lib/platform-worker-auth";
import {
  createLogger,
  resolveCorrelationId,
  runWithCorrelationId,
} from "@/lib/logger";

/**
 * @deprecated Agent wakeups are drained by the pg-boss worker process
 * (`AIDOS_PROCESS_ROLE=worker` or `npm run worker:agents`), not HTTP polling.
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

    log.warn("deprecated agent worker HTTP drain — use pg-boss worker process");

    return NextResponse.json(
      {
        error:
          "Agent wakeup drain moved to pg-boss. Run the worker process (AIDOS_PROCESS_ROLE=worker or npm run worker:agents).",
        deprecated: true,
      },
      { status: 410 },
    );
  });
}
