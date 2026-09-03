import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { loadSuppressed } from "@/lib/drydock/loaders";

export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const items = await loadSuppressed(session.organizationId);
  return NextResponse.json({ ok: true, items });
}
