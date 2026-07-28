import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";

/** No-op while Mastra agents are being migrated. */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json({ ok: true });
}
