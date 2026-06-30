import { NextResponse } from "next/server";
import { z } from "zod";
import { runScheduledJiraCalibration } from "@/lib/jira-calibration/scheduled";
import {
  platformWorkerNotConfigured,
  verifyPlatformWorkerRequest,
} from "@/lib/platform-worker-auth";

const bodySchema = z
  .object({
    organizationId: z.string().min(1).optional(),
  })
  .optional();

/**
 * Platform worker endpoint for Jira 90-day workflow calibration.
 * Auth: `Authorization: Bearer $PLATFORM_WORKER_SECRET`
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

  let organizationId: string | undefined;
  try {
    const raw = await request.json().catch(() => undefined);
    const parsed = bodySchema.parse(raw);
    organizationId = parsed?.organizationId;
  } catch {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const result = await runScheduledJiraCalibration({ organizationId });

  return NextResponse.json({
    ok: true,
    ...result,
  });
}
