import { NextResponse } from "next/server";
import {
  platformWorkerNotConfigured,
  verifyPlatformWorkerRequest,
} from "@/lib/platform-worker-auth";
import { validateAgentControlPlaneScale } from "@/lib/agent-control-plane/pg-scale-check";

/**
 * PostgreSQL scale validation for agent control plane (Phase 5.5).
 * Auth: `Authorization: Bearer $PLATFORM_WORKER_SECRET`
 */
export async function GET(request: Request) {
  if (platformWorkerNotConfigured()) {
    return NextResponse.json(
      { error: "Platform worker is not configured (set PLATFORM_WORKER_SECRET)" },
      { status: 503 },
    );
  }

  if (!verifyPlatformWorkerRequest(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await validateAgentControlPlaneScale();
  return NextResponse.json(result, { status: result.ok ? 200 : 503 });
}
