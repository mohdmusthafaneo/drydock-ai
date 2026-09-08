import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { loadOverviewDashboard } from "@/lib/overview/load-overview";

const querySchema = z.object({
  team: z.string().min(1).max(64).optional(),
  sprint: z.string().min(1).max(128).optional(),
  /** Prefer live org loaders when set. Demo default is AppData mock. */
  live: z.enum(["0", "1", "true", "false"]).optional(),
});

function preferLive(value: string | undefined): boolean {
  if (value == null) return false;
  const v = value.trim().toLowerCase();
  return v === "1" || v === "true";
}

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

  const url = new URL(request.url);
  let query: z.infer<typeof querySchema>;
  try {
    query = querySchema.parse({
      team: url.searchParams.get("team") ?? undefined,
      sprint: url.searchParams.get("sprint") ?? undefined,
      live: url.searchParams.get("live") ?? undefined,
    });
  } catch {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  try {
    const data = await loadOverviewDashboard({
      organizationId: session.organizationId,
      userName: session.name,
      teamKey: query.team ?? null,
      sprintId: query.sprint ?? null,
      // Demo stage: AppData mock via selectOverviewModel; ?live=1 for live loaders.
      useFixture: !preferLive(query.live),
    });

    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("[overview]", error);
    return NextResponse.json(
      { error: "Failed to load overview dashboard." },
      { status: 500 },
    );
  }
}
