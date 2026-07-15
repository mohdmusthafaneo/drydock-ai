"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatStreamEvent } from "@/lib/agent-chat/types";

export type StreamingMessageState = {
  messageId: string;
  text: string;
  isStreaming: boolean;
  thinking: boolean;
  activeTool?: string;
};

type UseAgentThreadStreamOptions = {
  onMessageFinal?: (messageId: string) => void;
  onHumanMessageSaved?: (messageId: string) => void;
};

export function useAgentThreadStream(
  threadId: string,
  options: UseAgentThreadStreamOptions = {},
) {
  const { onMessageFinal, onHumanMessageSaved } = options;
  const [streaming, setStreaming] = useState<StreamingMessageState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const onMessageFinalRef = useRef(onMessageFinal);
  const onHumanMessageSavedRef = useRef(onHumanMessageSaved);
  onMessageFinalRef.current = onMessageFinal;
  onHumanMessageSavedRef.current = onHumanMessageSaved;

  const clearStreaming = useCallback(() => {
    setStreaming(null);
  }, []);

  const sendMessage = useCallback(
    async (content: string) => {
      if (!threadId || !content.trim() || sending) return;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSending(true);
      setError(null);
      setStreaming({
        messageId: `pending-${Date.now()}`,
        text: "",
        isStreaming: true,
        thinking: true,
      });

      try {
        const res = await fetch(`/api/agent-threads/${threadId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ content }),
          signal: controller.signal,
        });

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(body?.error ?? `Request failed (${res.status})`);
        }

        if (!res.body) {
          throw new Error("No response stream");
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let newlineIdx = buffer.indexOf("\n");
          while (newlineIdx >= 0) {
            const line = buffer.slice(0, newlineIdx).trim();
            buffer = buffer.slice(newlineIdx + 1);
            newlineIdx = buffer.indexOf("\n");
            if (!line) continue;

            let event: ChatStreamEvent;
            try {
              event = JSON.parse(line) as ChatStreamEvent;
            } catch {
              continue;
            }

            switch (event.type) {
              case "message_saved":
                onHumanMessageSavedRef.current?.(event.messageId);
                break;
              case "thinking":
                setStreaming((prev) =>
                  prev
                    ? { ...prev, thinking: event.active, isStreaming: true }
                    : prev,
                );
                break;
              case "text_delta":
                setStreaming((prev) =>
                  prev
                    ? {
                        ...prev,
                        text: prev.text + event.text,
                        thinking: false,
                        isStreaming: true,
                      }
                    : {
                        messageId: `pending-${Date.now()}`,
                        text: event.text,
                        thinking: false,
                        isStreaming: true,
                      },
                );
                break;
              case "tool_start":
                setStreaming((prev) =>
                  prev
                    ? { ...prev, thinking: true, activeTool: event.tool }
                    : prev,
                );
                break;
              case "tool_end":
                setStreaming((prev) =>
                  prev
                    ? { ...prev, activeTool: undefined }
                    : prev,
                );
                break;
              case "done":
                setStreaming({
                  messageId: event.messageId,
                  text: event.text,
                  isStreaming: false,
                  thinking: false,
                });
                onMessageFinalRef.current?.(event.messageId);
                break;
              case "error":
                setError(event.error);
                setStreaming((prev) =>
                  prev ? { ...prev, isStreaming: false, thinking: false } : prev,
                );
                break;
            }
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to send message");
        setStreaming((prev) =>
          prev ? { ...prev, isStreaming: false, thinking: false } : null,
        );
      } finally {
        setSending(false);
        abortRef.current = null;
      }
    },
    [threadId, sending],
  );

  return {
    streaming,
    streamingMessages: streaming ? [streaming] : [],
    sending,
    error,
    sendMessage,
    clearStreaming,
    connected: true,
    disconnected: false,
  };
}
