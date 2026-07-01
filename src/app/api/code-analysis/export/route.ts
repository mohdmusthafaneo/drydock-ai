import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { resolveStoredCodeAnalysis, snapshotForFilters } from "@/lib/code-analysis/sync";
import { getMockCodeAnalysisSnapshot } from "@/lib/code-analysis/mock-data";
import type { CodeAnalysisFilters } from "@/lib/code-analysis/types";

const querySchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).optional(),
  repos: z.string().optional(),
});

function csvEscape(value: string): string {
  return `"${value.replace(/"/g, '""')}"`;
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
      range: url.searchParams.get("range") ?? undefined,
      repos: url.searchParams.get("repos") ?? undefined,
    });
  } catch {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  const integration = await prisma.integration.findUnique({
    where: {
      organizationId_provider: {
        organizationId: session.organizationId,
        provider: "GITHUB",
      },
    },
  });

  const filters: Partial<CodeAnalysisFilters> = {
    range: query.range ?? "30d",
    repos: query.repos ? query.repos.split(",").filter(Boolean) : undefined,
  };

  const stored = await resolveStoredCodeAnalysis(
    session.organizationId,
    integration?.metadataJson,
  );

  const snapshot = stored
    ? snapshotForFilters(stored, filters)
    : getMockCodeAnalysisSnapshot(filters);

  const prHeader =
    "repo,pr_number,title,author,merged_at,ai_attribution,confidence,reviews,reviewers,jira_keys,completion_score,completion_rationale,risk_score,risk_level,quality_flags\n";
  const prRows = snapshot.pullRequests
    .map((p) =>
      [
        csvEscape(p.repo),
        p.number,
        csvEscape(p.title),
        p.author,
        p.mergedAt,
        p.attribution,
        p.confidence,
        p.reviewCount,
        csvEscape((p.reviewers ?? []).join(";")),
        csvEscape((p.jiraKeys ?? []).join(";")),
        p.completionScore ?? "",
        csvEscape(p.completionRationale ?? ""),
        p.riskScore ?? "",
        p.riskLevel ?? "",
        csvEscape((p.qualityFlags ?? []).join(";")),
      ].join(","),
    )
    .join("\n");

  const commitHeader =
    "\n\nrepo,sha,message,author,committed_at,branch,ai_attribution,confidence,jira_keys,completion_score,completion_rationale\n";
  const commitRows = snapshot.commits
    .map((c) =>
      [
        csvEscape(c.repo),
        c.sha,
        csvEscape(c.message),
        c.author,
        c.committedAt,
        csvEscape(c.branch ?? ""),
        c.attribution,
        c.confidence,
        csvEscape((c.jiraKeys ?? []).join(";")),
        c.completionScore ?? "",
        csvEscape(c.completionRationale ?? ""),
      ].join(","),
    )
    .join("\n");

  return new NextResponse(prHeader + prRows + commitHeader + commitRows, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="code-analysis-${filters.range ?? "30d"}.csv"`,
    },
  });
}
