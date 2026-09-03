import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import { signCertificate } from "@/lib/drydock/certificate";

const bodySchema = z.object({
  releaseId: z.string().min(1),
  decision: z.enum(["SHIP", "HOLD", "ACCEPT_RISK"]),
  rationale: z.string().min(1),
  acceptedRisk: z.string().default(""),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const row = await signCertificate({
    organizationId: session.organizationId,
    ...parsed.data,
  });
  return NextResponse.json({ ok: true, id: row.id, signedAt: row.signedAt });
}
