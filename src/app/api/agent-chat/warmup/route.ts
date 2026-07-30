import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";
import { getMastra } from "@/mastra";

/** Warm Mastra singleton so the first chat turn is not cold-boot delayed. */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  await getMastra();
  return NextResponse.json({ ok: true });
}
