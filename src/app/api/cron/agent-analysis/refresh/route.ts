import { NextResponse } from "next/server";
import { z } from "zod";

import {
  platformWorkerNotConfigured,
  verifyPlatformWorkerRequest,
} from "@/lib/platform-worker-auth";
import { getMastra } from "@/mastra";

const bodySchema = z
  .object({
    organizationId: z.string().min(1).optional(),
  })
  .optional();

/**
 * Manual / external cron trigger for the four domain agents.
 * Auth: `Authorization: Bearer $PLATFORM_WORKER_SECRET`
 *
 * Prefer the Mastra declarative schedule on `agent-analysis-refresh-workflow`
 * for automatic runs; use this route to fire on demand.
 */
export async function POST(request: Request) {
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

  const mastra = await getMastra();
  const workflow = mastra.getWorkflow("agentAnalysisRefreshWorkflow");
  const run = await workflow.createRun();
  const { runId } = await run.startAsync({
    inputData: organizationId ? { organizationId } : {},
  });

  return NextResponse.json({
    ok: true,
    started: true,
    job: "agent-analysis.refresh",
    runId,
    organizationId: organizationId ?? null,
  });
}
