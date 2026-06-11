"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { StreamChunkSsePayload } from "@/lib/agent-chat/types";

export type StreamingMessageState = {
  messageId: string;
  runId: string;
  agentId: string;
  text: string;
  thinking: string;
  isStreaming: boolean;
  tools: Array<{
    name: string;
    input: Record<string, unknown>;
    outputPreview?: string;
    startedAt: string;
    endedAt?: string;
  }>;
};

type UseAgentThreadStreamOptions = {
  enabled?: boolean;
  onMessageFinal?: (messageId: string) => void;
};

export function useAgentThreadStream(
  threadId: string,
  options: UseAgentThreadStreamOptions = {},
) {
  const { enabled = true, onMessageFinal } = options;
  const [streamingByRunId, setStreamingByRunId] = useState<
    Record<string, StreamingMessageState>
  >({});
  const [connected, setConnected] = useState(false);
  const [disconnected, setDisconnected] = useState(false);
  const lastEventIdRef = useRef<string | null>(null);
  const onMessageFinalRef = useRef(onMessageFinal);
  onMessageFinalRef.current = onMessageFinal;

  const upsertStreaming = useCallback(
    (runId: string, updater: (prev: StreamingMessageState | undefined) => StreamingMessageState) => {
      setStreamingByRunId((prev) => ({
        ...prev,
        [runId]: updater(prev[runId]),
      }));
    },
    [],
  );

  useEffect(() => {
    if (!enabled || !threadId) return;

    let source: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;

    function connect() {
      if (cancelled) return;

      const url = `/api/agent-threads/${threadId}/stream`;
      source = new EventSource(url, { withCredentials: true });

      source.onopen = () => {
        setConnected(true);
        setDisconnected(false);
      };

      source.addEventListener("chunk", (event) => {
        const messageEvent = event as MessageEvent<string>;
        if (messageEvent.lastEventId) {
          lastEventIdRef.current = messageEvent.lastEventId;
        }

        let payload: StreamChunkSsePayload;
        try {
          payload = JSON.parse(messageEvent.data) as StreamChunkSsePayload;
        } catch {
          return;
        }

        const { runId, agentId, messageId, kind } = payload;
        if (!runId || !agentId) return;

        upsertStreaming(runId, (prev) => {
          const base: StreamingMessageState = prev ?? {
            messageId: messageId ?? `pending-${runId}`,
            runId,
            agentId,
            text: "",
            thinking: "",
            isStreaming: true,
            tools: [],
          };

          if (messageId) base.messageId = messageId;

          switch (kind) {
            case "text_delta":
              if (payload.text) base.text += payload.text;
              break;
            case "thinking_delta":
              if (payload.thinking) base.thinking += payload.thinking;
              break;
            case "tool_start":
              if (payload.tool) {
                base.tools = [
                  ...base.tools,
                  {
                    name: payload.tool,
                    input: payload.input ?? {},
                    startedAt: new Date().toISOString(),
                  },
                ];
              }
              break;
            case "tool_end":
              if (payload.tool) {
                const idx = base.tools.findLastIndex((t) => t.name === payload.tool);
                if (idx >= 0) {
                  base.tools[idx] = {
                    ...base.tools[idx],
                    outputPreview: payload.outputPreview,
                    endedAt: new Date().toISOString(),
                  };
                }
              }
              break;
            case "run_complete":
              base.isStreaming = false;
              break;
            case "run_error":
              base.isStreaming = false;
              if (payload.error && !base.text) {
                base.text = payload.error;
              }
              break;
          }

          return { ...base };
        });
      });

      source.addEventListener("message_final", (event) => {
        const messageEvent = event as MessageEvent<string>;
        if (messageEvent.lastEventId) {
          lastEventIdRef.current = messageEvent.lastEventId;
        }

        try {
          const data = JSON.parse(messageEvent.data) as {
            messageId?: string;
            runId?: string;
          };
          if (data.runId) {
            upsertStreaming(data.runId, (prev) =>
              prev
                ? {
                    ...prev,
                    messageId: data.messageId ?? prev.messageId,
                    isStreaming: false,
                  }
                : {
                    messageId: data.messageId ?? `pending-${data.runId}`,
                    runId: data.runId!,
                    agentId: "",
                    text: "",
                    thinking: "",
                    isStreaming: false,
                    tools: [],
                  },
            );
          }
          if (data.messageId) {
            onMessageFinalRef.current?.(data.messageId);
          }
        } catch {
          // ignore
        }
      });

      source.onerror = () => {
        setConnected(false);
        setDisconnected(true);
        source?.close();
        source = null;
        if (!cancelled) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      source?.close();
      setConnected(false);
    };
  }, [enabled, threadId, upsertStreaming]);

  const clearCompletedStreaming = useCallback((messageId: string) => {
    setStreamingByRunId((prev) => {
      const next = { ...prev };
      for (const [runId, state] of Object.entries(next)) {
        if (state.messageId === messageId && !state.isStreaming) {
          delete next[runId];
        }
      }
      return next;
    });
  }, []);

  const streamingMessages = Object.values(streamingByRunId).filter(
    (msg) => msg.isStreaming || msg.text.length > 0,
  );

  return {
    streamingMessages,
    connected,
    disconnected,
    clearCompletedStreaming,
  };
}
