import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { requirePermission } from "@/lib/rbac";
import { loadCursorAiSnapshot } from "@/lib/cursor-api/load-snapshot";

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

  try {
    const url = new URL(request.url);
    const data = loadCursorAiSnapshot({
      email: session.email,
      teamKey: url.searchParams.get("team"),
      sprintId: url.searchParams.get("sprint"),
    });
    return NextResponse.json({ ok: true, data });
  } catch (error) {
    console.error("[ai/cursor-snapshot]", error);
    return NextResponse.json(
      { error: "Failed to load AI snapshot." },
      { status: 500 },
    );
  }
}
