import { NextResponse } from "next/server";
import { z } from "zod";
import { getSession } from "@/lib/session";
import {
  createAgentChatThread,
  listAgentChatThreads,
  type ThreadListStatusFilter,
} from "@/lib/agent-chat";

const createSchema = z.object({
  title: z.string().max(120).optional(),
  initialMessage: z.string().max(8000).optional(),
});

const listQuerySchema = z.object({
  status: z.enum(["open", "done", "all"]).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = createSchema.parse(await request.json());
    const result = await createAgentChatThread({
      organizationId: session.organizationId,
      userId: session.userId,
      title: body.title,
      initialMessage: body.initialMessage,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      threadId: result.data.threadId,
      messageId: result.data.messageId,
    });
  } catch {
    return NextResponse.json({ error: "Invalid thread data" }, { status: 400 });
  }
}

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const query = listQuerySchema.safeParse({
    status: url.searchParams.get("status") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });

  if (!query.success) {
    return NextResponse.json({ error: "Invalid query parameters" }, { status: 400 });
  }

  const { threads, nextCursor } = await listAgentChatThreads(
    session.organizationId,
    {
      status: (query.data.status ?? "open") as ThreadListStatusFilter,
      cursor: query.data.cursor,
      limit: query.data.limit,
    },
  );

  return NextResponse.json({ ok: true, threads, nextCursor });
}
