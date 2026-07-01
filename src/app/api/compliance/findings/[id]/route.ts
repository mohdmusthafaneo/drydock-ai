import { NextResponse } from "next/server";
import { z } from "zod";

import { mutateComplianceFinding } from "@/lib/compliance/mutate-finding";
import { requirePermission } from "@/lib/rbac";
import { getSession } from "@/lib/session";

const bodySchema = z.object({
  action: z.enum(["resolve", "dismiss", "acknowledge"]),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    requirePermission(session, "compliance", "manage");
  } catch {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { id } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request body" }, { status: 400 });
  }

  const finding = await mutateComplianceFinding({
    organizationId: session.organizationId,
    findingId: id,
    action: parsed.data.action,
    userId: session.userId,
  });

  if (!finding) {
    return NextResponse.json({ error: "Finding not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, finding });
}
