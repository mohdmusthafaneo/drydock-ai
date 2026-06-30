import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import type { DeliveryAnalysisFilters } from "@/lib/delivery-analysis/types";
import { deliveryAnalysisToCsv } from "@/lib/delivery-analysis/export-csv";
import { deliveryAnalysisForFilters, resolveStoredJiraDelivery } from "@/lib/delivery-analysis/resolve";

const querySchema = z.object({
  projectKey: z.string().min(1).max(32).optional(),
  riskFocus: z.enum(["all", "blockers", "schedule", "quality", "sprint"]).optional(),
  range: z.enum(["7d", "30d", "90d"]).optional(),
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
    compare: "previous_sync",
  };

  const snapshot = deliveryAnalysisForFilters(stored, filters, {
    pending: !stored.calibrationGate?.calibrated,
    message: stored.calibrationGate?.message,
  });
  const csv = deliveryAnalysisToCsv(snapshot);
  const suffix = filters.projectKey ?? "all";

  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="delivery-analysis-${suffix}-${filters.range}.csv"`,
    },
  });
}
