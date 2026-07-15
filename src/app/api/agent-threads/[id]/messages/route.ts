import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildChatContextMarkdown,
  postAssistantChatMessage,
  postHumanChatMessage,
  type ChatStreamEvent,
} from "@/lib/agent-chat";
import { getSession } from "@/lib/session";
import { getMastra } from "@/mastra";
import {
  createAidosRequestContext,
  createAidosToolContext,
} from "@/mastra/tools/aidos";
import { AIDOS_ASSISTANT_INSTRUCTIONS } from "@/mastra/agents";
import { runAidosAssistant } from "@/mastra/workflows/run-assistant";

type RouteParams = { params: Promise<{ id: string }> };

const messageSchema = z.object({
  content: z.string().min(1).max(8000),
});

function encodeEvent(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

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

  const humanResult = await postHumanChatMessage({
    organizationId: session.organizationId,
    userId: session.userId,
    threadId,
    content: body.content,
  });

  if (!humanResult.ok) {
    return NextResponse.json(
      { error: humanResult.error },
      { status: humanResult.status ?? 400 },
    );
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (event: ChatStreamEvent) => {
        controller.enqueue(encodeEvent(event));
      };

      enqueue({ type: "message_saved", messageId: humanResult.data.messageId });
      enqueue({ type: "thinking", active: true });

      try {
        const [mastra, chatContext] = await Promise.all([
          getMastra(),
          buildChatContextMarkdown({
            organizationId: session.organizationId,
            threadId,
          }),
        ]);

        const requestContext = createAidosRequestContext(
          createAidosToolContext({ organizationId: session.organizationId }),
        );

        const systemPrompt = [
          AIDOS_ASSISTANT_INSTRUCTIONS,
          chatContext ? `\n\n${chatContext}` : "",
        ].join("");

        let accumulated = "";

        const result = await runAidosAssistant({
          mastra,
          organizationId: session.organizationId,
          systemPrompt,
          userMessage: body.content,
          requestContext,
          handlers: {
            onTextDelta: (text) => {
              accumulated += text;
              enqueue({ type: "text_delta", text });
            },
            onToolStart: (tool) => {
              enqueue({ type: "tool_start", tool });
            },
            onToolEnd: (tool) => {
              enqueue({ type: "tool_end", tool });
            },
            onError: (error) => {
              enqueue({ type: "error", error });
            },
          },
        });

        const finalText = (result.summary || accumulated).trim();
        if (!finalText) {
          enqueue({ type: "error", error: "Assistant returned an empty response" });
          controller.close();
          return;
        }

        const persisted = await postAssistantChatMessage({
          organizationId: session.organizationId,
          threadId,
          contentMarkdown: finalText,
        });

        if (!persisted.ok) {
          enqueue({ type: "error", error: persisted.error });
          controller.close();
          return;
        }

        enqueue({ type: "thinking", active: false });
        enqueue({
          type: "done",
          messageId: persisted.messageId,
          text: finalText,
        });
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
    },
  });
}
