import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getCatalogEntryDetail } from "@/lib/agent-control-plane/team-catalog";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    const detail = await getCatalogEntryDetail(id);
    return NextResponse.json({ ok: true, ...detail });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Not found" },
      { status: 404 },
    );
  }
}
