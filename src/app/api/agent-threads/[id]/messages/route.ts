import { NextResponse } from "next/server";
import { z } from "zod";

import {
  buildChatContextMarkdown,
  buildReasoningJson,
  getLastHumanChatMessage,
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

  // Open the NDJSON stream immediately so Thinking arrives before DB/model work.
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const enqueue = (event: ChatStreamEvent) => {
        controller.enqueue(encodeEvent(event));
      };

      enqueue({ type: "thinking", active: true });

      try {
        let humanMessageId: string;
        let userMessage: string;

        if (regenerate) {
          const [lastHuman, mastra] = await Promise.all([
            getLastHumanChatMessage({
              organizationId: session.organizationId,
              threadId,
            }),
            getMastra(),
          ]);
          if (!lastHuman.ok) {
            enqueue({ type: "error", error: lastHuman.error });
            return;
          }
          humanMessageId = lastHuman.data.messageId;
          userMessage = lastHuman.data.content;
          enqueue({ type: "message_saved", messageId: humanMessageId });

          await streamAssistant({
            enqueue,
            mastra,
            sessionOrgId: session.organizationId,
            threadId,
            userMessage,
          });
          return;
        }

        const [humanResult, mastra] = await Promise.all([
          postHumanChatMessage({
            organizationId: session.organizationId,
            userId: session.userId,
            threadId,
            content: body.content!,
          }),
          getMastra(),
        ]);

        if (!humanResult.ok) {
          enqueue({ type: "error", error: humanResult.error });
          return;
        }

        humanMessageId = humanResult.data.messageId;
        userMessage = body.content!.trim();
        enqueue({ type: "message_saved", messageId: humanMessageId });

        await streamAssistant({
          enqueue,
          mastra,
          sessionOrgId: session.organizationId,
          threadId,
          userMessage,
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
      "X-Accel-Buffering": "no",
    },
  });
}

async function streamAssistant(input: {
  enqueue: (event: ChatStreamEvent) => void;
  mastra: Awaited<ReturnType<typeof getMastra>>;
  sessionOrgId: string;
  threadId: string;
  userMessage: string;
}) {
  const { enqueue, mastra, sessionOrgId, threadId, userMessage } = input;

  const chatContext = await buildChatContextMarkdown({
    organizationId: sessionOrgId,
    threadId,
  });

  const requestContext = createAidosRequestContext(
    createAidosToolContext({ organizationId: sessionOrgId }),
  );

  const systemPrompt = [
    AIDOS_ASSISTANT_INSTRUCTIONS,
    chatContext ? `\n\n${chatContext}` : "",
  ].join("");

  let accumulated = "";
  let thinkingAccumulated = "";
  type ToolRun = {
    name: string;
    input: Record<string, unknown>;
    outputPreview?: string;
    startedAt: string;
    endedAt?: string;
    toolCallId?: string;
    isError?: boolean;
  };
  const tools: ToolRun[] = [];
  const toolsById = new Map<string, ToolRun>();

  const result = await runAidosAssistant({
    mastra,
    organizationId: sessionOrgId,
    systemPrompt,
    userMessage,
    requestContext,
    handlers: {
      onTextDelta: (text) => {
        accumulated += text;
        enqueue({ type: "text_delta", text });
      },
      // Only the model's genuine reasoning tokens populate the Thought stream.
      // Tool activity is surfaced as tool cards, never fabricated prose.
      onThinkingDelta: (text) => {
        if (!text) return;
        thinkingAccumulated += text;
        enqueue({ type: "thinking_delta", text });
      },
      onToolStart: (tool, toolInput, toolCallId) => {
        const run: ToolRun = {
          name: tool,
          input: toolInput,
          startedAt: new Date().toISOString(),
          toolCallId,
        };
        tools.push(run);
        toolsById.set(toolCallId, run);
        enqueue({ type: "tool_start", tool, input: toolInput, toolCallId });
      },
      onToolEnd: (tool, outputPreview, toolCallId, isError) => {
        const run =
          toolsById.get(toolCallId) ??
          [...tools].reverse().find((t) => t.name === tool && !t.endedAt);
        if (run) {
          run.endedAt = new Date().toISOString();
          run.outputPreview = outputPreview;
          run.isError = isError;
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

  const finalText = (result.summary || accumulated).trim();
  if (!finalText) {
    enqueue({ type: "error", error: "Assistant returned an empty response" });
    return;
  }

  // Force-close any tool that never received a result so it never persists as
  // a perpetually "running" card.
  const closedAt = new Date().toISOString();
  for (const run of tools) {
    if (!run.endedAt) run.endedAt = closedAt;
  }

  const reasoningJson =
    thinkingAccumulated.trim() || tools.length > 0
      ? buildReasoningJson({
          thinking: thinkingAccumulated.trim(),
          tools,
        })
      : undefined;

  const persisted = await postAssistantChatMessage({
    organizationId: sessionOrgId,
    threadId,
    contentMarkdown: finalText,
    reasoningJson,
  });

  if (!persisted.ok) {
    enqueue({ type: "error", error: persisted.error });
    return;
  }

  enqueue({ type: "thinking", active: false });
  enqueue({
    type: "done",
    messageId: persisted.messageId,
    text: finalText,
    thinking: thinkingAccumulated.trim() || undefined,
    tools: tools.length > 0 ? tools : undefined,
  });
}
