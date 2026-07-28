import { NextResponse } from "next/server";
import { z } from "zod";

import {
  getLastHumanChatMessage,
  postHumanChatMessage,
  type ChatStreamEvent,
} from "@/lib/agent-chat";
import { getSession } from "@/lib/session";

type RouteParams = { params: Promise<{ id: string }> };

const messageSchema = z
  .object({
    content: z.string().min(1).max(8000).optional(),
    regenerate: z.boolean().optional(),
  })
  .superRefine((data, ctx) => {
    if (!data.regenerate && !data.content?.trim()) {
      ctx.addIssue({
        code: "custom",
        message: "content is required unless regenerate is true",
        path: ["content"],
      });
    }
  });

function encodeEvent(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

const ASSISTANT_UNAVAILABLE =
  "AIDOS Assistant is temporarily unavailable while Mastra agents are being migrated.";

/**
 * Chat streaming paused during Mastra four-agent migration.
 * Human messages still persist; assistant replies are disabled.
 */
export async function POST(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id: threadId } = await params;

  let body: z.infer<typeof messageSchema>;
  try {
    body = messageSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid message data" }, { status: 400 });
  }

  const regenerate = Boolean(body.regenerate);

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (event: ChatStreamEvent) => {
        controller.enqueue(encodeEvent(event));
      };

      enqueue({ type: "thinking", active: true });

      try {
        if (regenerate) {
          const lastHuman = await getLastHumanChatMessage({
            organizationId: session.organizationId,
            threadId,
          });
          if (!lastHuman.ok) {
            enqueue({ type: "error", error: lastHuman.error });
            return;
          }
          enqueue({ type: "message_saved", messageId: lastHuman.data.messageId });
        } else {
          const humanResult = await postHumanChatMessage({
            organizationId: session.organizationId,
            userId: session.userId,
            threadId,
            content: body.content!,
          });
          if (!humanResult.ok) {
            enqueue({ type: "error", error: humanResult.error });
            return;
          }
          enqueue({ type: "message_saved", messageId: humanResult.data.messageId });
        }

        enqueue({ type: "thinking", active: false });
        enqueue({ type: "error", error: ASSISTANT_UNAVAILABLE });
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Assistant failed to respond";
        enqueue({ type: "thinking", active: false });
        enqueue({ type: "error", error: message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
