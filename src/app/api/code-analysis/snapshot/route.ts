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
  author: z.string().optional(),
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
      author: url.searchParams.get("author") ?? undefined,
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
    author: query.author ?? null,
    repos: query.repos ? query.repos.split(",").filter(Boolean) : undefined,
  };

  const stored = await resolveStoredCodeAnalysis(
    session.organizationId,
    integration?.metadataJson,
  );

  if (stored) {
    const snapshot = snapshotForFilters(stored, filters);
    return NextResponse.json({
      ok: true,
      source: "github",
      syncedAt: stored.syncedAt,
      snapshot,
    });
  }

  const snapshot = getMockCodeAnalysisSnapshot(filters);
  return NextResponse.json({
    ok: true,
    source: "mock",
    syncedAt: null,
    snapshot,
  });
}
