import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { listAgentSummaries } from "@/lib/agents";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "agents", "view");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const agents = await listAgentSummaries(session.organizationId);
  return NextResponse.json({ agents });
}
