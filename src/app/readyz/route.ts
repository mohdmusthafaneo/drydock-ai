import { NextResponse } from "next/server";
import { getReadiness } from "@/lib/health";
import { getRequestLogger } from "@/lib/logger";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const log = getRequestLogger(request, { route: "readyz" });
  const readiness = await getReadiness();

  if (!readiness.ok) {
    log.warn({ checks: readiness.checks }, "readiness check failed");
    return NextResponse.json(
      { ok: false, status: "not_ready", checks: readiness.checks },
      {
        status: 503,
        headers: { "Cache-Control": "no-store" },
      },
    );
  }

  log.debug({ checks: readiness.checks }, "readiness check passed");
  return NextResponse.json(
    { ok: true, status: "ready", checks: readiness.checks },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
