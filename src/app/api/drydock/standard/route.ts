import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { ratifyStandardPattern } from "@/lib/drydock/standard";

const bodySchema = z.object({
  patternId: z.string().min(1),
  status: z.enum(["RATIFIED", "REJECTED"]),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const row = await ratifyStandardPattern({
    organizationId: session.organizationId,
    patternId: parsed.data.patternId,
    status: parsed.data.status,
  });
  return NextResponse.json({ ok: true, id: row.id, status: row.status });
}
