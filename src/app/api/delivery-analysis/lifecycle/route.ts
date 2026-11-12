import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { resolveLifecycleSnapshot } from "@/lib/delivery-analysis/lifecycle-resolve";
import { resolveStoredJiraDelivery } from "@/lib/delivery-analysis/resolve";

const querySchema = z.object({
  projectKey: z.string().min(1).max(32).optional(),
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

  const lifecycle = resolveLifecycleSnapshot({
    sample: stored.lifecycleIssueSample,
    range: query.range ?? "30d",
    projectKey: query.projectKey ?? null,
    siteUrl: stored.siteUrl,
    mapping: stored.mapping,
  });

  return NextResponse.json({
    ok: true,
    source: lifecycle.source,
    lifecycle,
  });
}
