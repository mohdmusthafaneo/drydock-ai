import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";
import { getAgentChatThread } from "@/lib/agent-chat";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const thread = await getAgentChatThread(session.organizationId, id);

  if (!thread) {
    return NextResponse.json({ error: "Thread not found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, thread });
}
