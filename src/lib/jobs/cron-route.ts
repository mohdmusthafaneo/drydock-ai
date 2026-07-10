import { NextResponse } from "next/server";
import { z } from "zod";

import {
  platformWorkerNotConfigured,
  verifyPlatformWorkerRequest,
} from "@/lib/platform-worker-auth";

const bodySchema = z
  .object({
    organizationId: z.string().min(1).optional(),
  })
  .optional();

type CronRouteOptions = {
  jobName: string;
  enqueue: (input: { organizationId?: string }) => Promise<string | null>;
};

/**
 * Thin platform-worker cron route — enqueues a pg-boss job instead of running inline.
 * Auth: `Authorization: Bearer $PLATFORM_WORKER_SECRET`
 */
export function createCronEnqueueRoute(options: CronRouteOptions) {
  return async function POST(request: Request) {
    if (platformWorkerNotConfigured()) {
      return NextResponse.json(
        {
          error:
            "Platform worker is not configured (set PLATFORM_WORKER_SECRET)",
        },
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

    const jobId = await options.enqueue({ organizationId });

    return NextResponse.json({
      ok: true,
      enqueued: true,
      job: options.jobName,
      jobId,
      organizationId: organizationId ?? null,
    });
  };
}
