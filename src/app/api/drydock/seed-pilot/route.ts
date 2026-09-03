import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { seedPilotSignalIntegrity } from "@/lib/drydock/seed-pilot";

/**
 * Dev/pilot helper — seeds Signal Integrity history for the session org.
 * Not a production sync path.
 */
export async function POST() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const result = await seedPilotSignalIntegrity(session.organizationId);
  return NextResponse.json({ ok: true, ...result });
}
