import { NextResponse } from "next/server";
import { z } from "zod";

import {
  loadPredictionSummary,
  loadProblemPredictions,
} from "@/lib/problem-prediction/load-predictions";
import { requirePermission } from "@/lib/rbac";
import { getSession } from "@/lib/session";

const querySchema = z.object({
  status: z.enum(["open", "resolved"]).optional(),
  severity: z.enum(["critical", "warning", "info"]).optional(),
  domain: z
    .enum(["delivery", "devops", "compliance", "planning", "code"])
    .optional(),
  projectKey: z.string().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "dashboard", "view");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const parsed = querySchema.safeParse({
    status: searchParams.get("status") ?? undefined,
    severity: searchParams.get("severity") ?? undefined,
    domain: searchParams.get("domain") ?? undefined,
    projectKey: searchParams.get("projectKey") ?? undefined,
    limit: searchParams.get("limit") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  const [predictions, summary] = await Promise.all([
    loadProblemPredictions(session.organizationId, parsed.data),
    loadPredictionSummary(session.organizationId),
  ]);

  return NextResponse.json({
    ok: true,
    predictions,
    summary,
  });
}
