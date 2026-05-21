import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { ingestTelemetryForOrganization } from "@/lib/telemetry-service";

const schema = z.object({
  releaseId: z.string().optional(),
  postDeploy: z.boolean().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = schema.parse(await request.json().catch(() => ({})));
    const result = await ingestTelemetryForOrganization({
      organizationId: session.organizationId,
      userId: session.userId,
      releaseId: body.releaseId,
      postDeploy: body.postDeploy ?? false,
    });

    return NextResponse.json({
      ok: true,
      correlationId: result.collected.correlationId,
      degradationDetected: result.collected.degradationDetected,
      summary: result.collected.summary,
    });
  } catch {
    return NextResponse.json({ error: "Telemetry collection failed" }, { status: 400 });
  }
}
