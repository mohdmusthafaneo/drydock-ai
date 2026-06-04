import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { getDeliveryAnalysisTrend } from "@/lib/delivery-analysis/history";

const querySchema = z.object({
  projectKey: z.string().min(1).max(32).optional(),
  days: z.coerce.number().int().min(7).max(90).optional(),
});

function daysToRange(days: number): "7d" | "30d" | "90d" {
  if (days <= 7) return "7d";
  if (days <= 30) return "30d";
  return "90d";
}

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
      days: url.searchParams.get("days") ?? undefined,
    });
  } catch {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  const days = query.days ?? 30;
  const range = daysToRange(days);
  const trend = await getDeliveryAnalysisTrend(
    session.organizationId,
    range,
    query.projectKey ?? null,
  );

  return NextResponse.json({
    ok: true,
    range,
    days,
    projectKey: query.projectKey ?? null,
    trend,
    hasHistory: trend.length >= 2,
  });
}
