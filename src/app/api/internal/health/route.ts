import { NextResponse } from "next/server";

import {
  platformWorkerNotConfigured,
  verifyPlatformWorkerRequest,
} from "@/lib/platform-worker-auth";
import { getInternalHealth } from "@/lib/internal-health";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "api/internal/health" });

/**
 * Operator deep-health surface.
 * Auth: `Authorization: Bearer $PLATFORM_WORKER_SECRET`
 */
export async function GET(request: Request) {
  if (platformWorkerNotConfigured()) {
    return NextResponse.json(
      {
        error:
          "Platform worker is not configured (set PLATFORM_WORKER_SECRET)",
      },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  if (!verifyPlatformWorkerRequest(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const report = await getInternalHealth();
    return NextResponse.json(report, {
      status: report.ok ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    });
  } catch (err) {
    log.error({ err }, "internal health check failed");
    return NextResponse.json(
      { ok: false, error: "Internal health check failed" },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
}
