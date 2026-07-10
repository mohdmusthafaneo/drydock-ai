import { getSession } from "@/lib/session";
import { getAgentChatThread } from "@/lib/agent-chat";
import {
  formatChunkForSse,
  getRunAgentIdMap,
  getStreamChunksAfter,
  purgeStaleStreamChunks,
  sseHeartbeatIntervalMs,
} from "@/lib/agent-chat/stream";
import { waitForAgentChatWake } from "@/lib/cache/sse-fanout";

type RouteParams = { params: Promise<{ id: string }> };

const POLL_MS = 500;

export async function GET(request: Request, { params }: RouteParams) {
  const session = await getSession();
  if (!session) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }

  const { id: threadId } = await params;
  const thread = await getAgentChatThread(session.organizationId, threadId);
  if (!thread) {
    return new Response(JSON.stringify({ error: "Thread not found" }), { status: 404 });
  }

  await purgeStaleStreamChunks().catch(() => undefined);

  const lastEventId = request.headers.get("Last-Event-ID");
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      let cursor: string | null = lastEventId;
      let closed = false;

      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {
          // already closed
        }
      };

      request.signal.addEventListener("abort", close);

      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch {
          close();
        }
      }, sseHeartbeatIntervalMs());

      const send = (id: string, event: string, data: Record<string, unknown>) => {
        controller.enqueue(
          encoder.encode(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      try {
        while (!closed && !request.signal.aborted) {
          const chunks = await getStreamChunksAfter({
            organizationId: session.organizationId,
            threadId,
            afterChunkId: cursor,
          });

          if (chunks.length > 0) {
            const agentMap = await getRunAgentIdMap(
              session.organizationId,
              [...new Set(chunks.map((c) => c.runId))],
            );

            for (const chunk of chunks) {
              if (closed) break;
              const agentId = agentMap.get(chunk.runId) ?? "";
              send(
                chunk.id,
                "chunk",
                formatChunkForSse(chunk, agentId) as unknown as Record<string, unknown>,
              );
              cursor = chunk.id;

              if (chunk.kind === "run_complete" && chunk.messageId) {
                send(chunk.id, "message_final", {
                  messageId: chunk.messageId,
                  runId: chunk.runId,
                  kind: "agent_reply",
                  authorAgentId: agentId,
                });
              }
            }
          }

          await waitForAgentChatWake(threadId, POLL_MS, request.signal);
        }
      } catch {
        close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
