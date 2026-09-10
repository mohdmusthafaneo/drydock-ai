import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { loadOverviewDashboard } from "@/lib/overview/load-overview";

const querySchema = z.object({
  team: z.string().min(1).max(64).optional(),
  sprint: z.string().min(1).max(128).optional(),
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

  const url = new URL(request.url);
  let query: z.infer<typeof querySchema>;
  try {
    query = querySchema.parse({
      team: url.searchParams.get("team") ?? undefined,
      sprint: url.searchParams.get("sprint") ?? undefined,
    });
  } catch {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  try {
    const data = await loadOverviewDashboard({
      organizationId: session.organizationId,
      userName: session.name,
      email: session.email,
      teamKey: query.team ?? null,
      sprintId: query.sprint ?? null,
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
