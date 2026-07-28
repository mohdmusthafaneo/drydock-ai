import { NextResponse } from "next/server";

import { getSession } from "@/lib/session";

/**
 * Mastra multi-step accelerator resume disabled during four-agent migration.
 * Generate uses the deterministic path only.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.json(
    {
      error:
        "MVP accelerator LLM workflow is unavailable while Mastra agents are being migrated",
    },
    { status: 410 },
  );
}
