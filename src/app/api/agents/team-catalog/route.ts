import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { listTeamCatalog } from "@/lib/agent-control-plane/team-catalog";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({
    ok: true,
    entries: listTeamCatalog(),
  });
}
