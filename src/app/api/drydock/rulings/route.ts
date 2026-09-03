import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { recordRuling } from "@/lib/drydock/rulings";

const bodySchema = z.object({
  findingId: z.string().min(1),
  reasonCode: z.string().min(1),
  customReason: z.string().optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  try {
    const ruling = await recordRuling({
      organizationId: session.organizationId,
      findingId: parsed.data.findingId,
      reasonCode: parsed.data.reasonCode,
      customReason: parsed.data.customReason,
    });
    return NextResponse.json({ ok: true, rulingId: ruling.id });
  } catch {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }
}
