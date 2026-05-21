import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { ingestNormalizedEvents, runTelemetryCollection } from "@/lib/telemetry-ingest";
import type { RawTelemetryInput } from "@/lib/telemetry-normalizer";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "telemetry", "ingest_telemetry");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const mode = body.mode as string | undefined;

  if (mode === "collect") {
    const result = await runTelemetryCollection({
      organizationId: session.organizationId,
      userId: session.userId,
      releaseId: body.releaseId,
      postDeploy: Boolean(body.postDeploy),
    });
    return NextResponse.json({
      ok: true,
      correlationId: result.collected.correlationId,
      metricCount: result.collected.metrics.length,
      eventCount: result.normalizedEvents.length,
    });
  }

  const events = (body.events ?? [body]) as RawTelemetryInput[];
  if (!Array.isArray(events) || events.length === 0) {
    return NextResponse.json({ error: "events array required" }, { status: 400 });
  }

  const created = await ingestNormalizedEvents({
    organizationId: session.organizationId,
    userId: session.userId,
    events,
  });

  return NextResponse.json({ ok: true, count: created.length, ids: created.map((e) => e.id) });
}
