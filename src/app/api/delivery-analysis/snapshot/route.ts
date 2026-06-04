import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import type { DeliveryAnalysisFilters } from "@/lib/delivery-analysis/types";
import { enrichDeliverySnapshot } from "@/lib/delivery-analysis/history";
import { resolveStoredJiraDelivery } from "@/lib/delivery-analysis/resolve";

const querySchema = z.object({
  projectKey: z.string().min(1).max(32).optional(),
  riskFocus: z.enum(["all", "blockers", "schedule", "quality", "sprint"]).optional(),
  range: z.enum(["7d", "30d", "90d"]).optional(),
  compare: z.enum(["previous_sync", "baseline"]).optional(),
});

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "integrations", "view");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(request.url);
  let query: z.infer<typeof querySchema>;
  try {
    query = querySchema.parse({
      projectKey: url.searchParams.get("projectKey") ?? undefined,
      riskFocus: url.searchParams.get("riskFocus") ?? undefined,
      range: url.searchParams.get("range") ?? undefined,
      compare: url.searchParams.get("compare") ?? undefined,
    });
  } catch {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  const stored = await resolveStoredJiraDelivery(session.organizationId);
  if (!stored) {
    return NextResponse.json(
      { error: "No Jira delivery snapshot. Sync on Integrations first." },
      { status: 404 },
    );
  }

  const filters: DeliveryAnalysisFilters = {
    projectKey: query.projectKey ?? null,
    riskFocus: query.riskFocus ?? "all",
    range: query.range ?? "30d",
    compare: query.compare ?? "previous_sync",
  };

  try {
    const snapshot = await enrichDeliverySnapshot(session.organizationId, stored, filters);

    return NextResponse.json({
      ok: true,
      source: "jira",
      syncedAt: stored.snapshot.syncedAt,
      projectKeys: stored.projectKeys,
      snapshot,
    });
  } catch (error) {
    console.error("[delivery-analysis/snapshot]", error);
    return NextResponse.json(
      { error: "Failed to compute delivery analysis snapshot." },
      { status: 500 },
    );
  }
}
