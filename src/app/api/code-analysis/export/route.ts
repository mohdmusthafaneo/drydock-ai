import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/prisma";
import { getStoredCodeAnalysisSnapshot, snapshotForFilters } from "@/lib/code-analysis/sync";
import { getMockCodeAnalysisSnapshot } from "@/lib/code-analysis/mock-data";
import type { CodeAnalysisFilters } from "@/lib/code-analysis/types";

const querySchema = z.object({
  range: z.enum(["7d", "30d", "90d"]).optional(),
  repos: z.string().optional(),
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

  const stored = integration
    ? getStoredCodeAnalysisSnapshot(integration.metadataJson)
    : null;

  const snapshot = stored
    ? snapshotForFilters(stored, filters)
    : getMockCodeAnalysisSnapshot(filters);

  const header =
    "repo,pr_number,title,author,merged_at,ai_attribution,confidence,reviews\n";
  const rows = snapshot.pullRequests
    .map(
      (p) =>
        `"${p.repo}",${p.number},"${p.title.replace(/"/g, '""')}",${p.author},${p.mergedAt},${p.attribution},${p.confidence},${p.reviewCount}`,
    )
    .join("\n");

  return new NextResponse(header + rows, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="code-analysis-${filters.range ?? "30d"}.csv"`,
    },
  });
}
