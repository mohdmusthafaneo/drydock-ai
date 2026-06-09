import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { authenticateAgentRequest } from "@/lib/agent-control-plane/agent-auth";
import { parseInboxItemId } from "@/lib/agent-control-plane/inbox";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(request: Request, { params }: RouteParams) {
  const auth = await authenticateAgentRequest(request);
  if (!auth) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: rawId } = await params;
  const itemId = decodeURIComponent(rawId);
  const parsed = parseInboxItemId(itemId);

  if (!parsed) {
    return NextResponse.json({ error: "Invalid work item id" }, { status: 400 });
  }

  const { workType, entityId } = parsed;

  if (workType === "release_assess") {
    const release = await prisma.release.findFirst({
      where: { id: entityId, organizationId: auth.organizationId },
    });

    if (!release) {
      return NextResponse.json({ error: "Release not found" }, { status: 404 });
    }

    const completed =
      release.status !== "DETECTED" ||
      (await prisma.recommendation.findFirst({
        where: {
          organizationId: auth.organizationId,
          releaseId: entityId,
          status: "PENDING",
        },
      })) !== null;

    return NextResponse.json({
      ok: true,
      itemId,
      completed,
      message: completed
        ? "Work item acknowledged as complete"
        : "Release still pending assessment",
    });
  }

  return NextResponse.json({
    ok: true,
    itemId,
    completed: true,
    message: "Work item acknowledged",
  });
}
