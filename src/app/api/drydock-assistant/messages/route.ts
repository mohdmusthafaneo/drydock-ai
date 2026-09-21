import { NextResponse } from "next/server";
import { z } from "zod";

import type { ChatStreamEvent } from "@/lib/agent-chat/types";
import { getSession } from "@/lib/session";
import { getMastra } from "@/mastra";
import {
  createDrydockAssistantRequestContext,
  createDrydockAssistantToolContext,
} from "@/mastra/tools/drydock-assistant";
import { runDrydockAssistant } from "@/mastra/workflows/run-drydock-assistant";

const messageSchema = z.object({
  content: z.string().min(1).max(8000),
  history: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(8000),
      }),
    )
    .max(20)
    .optional(),
  team: z.string().min(1).max(64).nullable().optional(),
  sprint: z.string().min(1).max(128).nullable().optional(),
});

function encodeEvent(event: ChatStreamEvent): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(event)}\n`);
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: z.infer<typeof messageSchema>;
  try {
    body = messageSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid message data" }, { status: 400 });
  }

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (event: ChatStreamEvent) => {
        controller.enqueue(encodeEvent(event));
      };

      enqueue({ type: "thinking", active: true });

      try {
        const mastra = await getMastra();
        const toolContext = createDrydockAssistantToolContext({
          email: session.email,
          organizationId: session.organizationId,
          userName: session.name,
          team: body.team ?? null,
          sprint: body.sprint ?? null,
        });
        const requestContext = createDrydockAssistantRequestContext(toolContext);

        let assistantText = "";
        const tools: NonNullable<
          Extract<ChatStreamEvent, { type: "done" }>["tools"]
        > = [];

        const result = await runDrydockAssistant({
          mastra,
          userMessage: body.content.trim(),
          history: body.history,
          requestContext,
          handlers: {
            onTextDelta: (text) => {
              assistantText += text;
              enqueue({ type: "text_delta", text });
            },
            onThinkingDelta: (text) => {
              enqueue({ type: "thinking_delta", text });
            },
            onToolStart: (tool, input, toolCallId) => {
              tools.push({
                name: tool,
                input,
                toolCallId,
                startedAt: new Date().toISOString(),
              });
              enqueue({ type: "tool_start", tool, input, toolCallId });
            },
            onToolEnd: (tool, outputPreview, toolCallId, isError) => {
              const existing = tools.find((t) => t.toolCallId === toolCallId);
              if (existing) {
                existing.outputPreview = outputPreview;
                existing.endedAt = new Date().toISOString();
                existing.isError = isError;
              }
              enqueue({
                type: "tool_end",
                tool,
                outputPreview,
                toolCallId,
                isError,
              });
            },
            onError: (error) => {
              enqueue({ type: "error", error });
            },
          },
        });

        if (!assistantText && result.summary) {
          assistantText = result.summary;
          enqueue({ type: "text_delta", text: result.summary });
        }

        enqueue({
          type: "done",
          messageId: `drydock-assistant-${Date.now()}`,
          text: assistantText || result.summary,
          tools: tools.length ? tools : undefined,
        });
      } catch (error) {
        console.error("[drydock-assistant/messages]", error);
        enqueue({
          type: "error",
          error:
            error instanceof Error
              ? error.message
              : "Failed to run DryDock assistant",
        });
      } finally {
        enqueue({ type: "thinking", active: false });
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
