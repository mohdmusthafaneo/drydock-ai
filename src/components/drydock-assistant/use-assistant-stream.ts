"use client";

import { useCallback, useRef, useState } from "react";
import type { ChatStreamEvent } from "@/lib/agent-chat/types";

export type AssistantHistoryItem = {
  role: "user" | "assistant";
  content: string;
};

async function readNdjsonStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: ChatStreamEvent) => void,
  signal: AbortSignal,
) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    if (signal.aborted) {
      await reader.cancel().catch(() => undefined);
      break;
    }
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let newlineIdx = buffer.indexOf("\n");
    while (newlineIdx >= 0) {
      const line = buffer.slice(0, newlineIdx).trim();
      buffer = buffer.slice(newlineIdx + 1);
      newlineIdx = buffer.indexOf("\n");
      if (!line) continue;
      try {
        onEvent(JSON.parse(line) as ChatStreamEvent);
      } catch {
        // skip malformed lines
      }
    }
  }
}

export function useAssistantStream() {
  const [sending, setSending] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [thinking, setThinking] = useState(false);
  const [activeTool, setActiveTool] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSending(false);
    setThinking(false);
    setActiveTool(null);
  }, []);

  const send = useCallback(
    async (input: {
      content: string;
      history: AssistantHistoryItem[];
      team: string | null;
      sprint: string | null;
    }): Promise<string | null> => {
      if (sending) return null;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setSending(true);
      setError(null);
      setStreamingText("");
      setThinking(true);
      setActiveTool(null);

      let finalText = "";

      try {
        const response = await fetch("/api/drydock-assistant/messages", {
          method: "POST",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            content: input.content,
            history: input.history,
            team: input.team,
            sprint: input.sprint,
          }),
        });

        if (!response.ok || !response.body) {
          const message =
            response.status === 401
              ? "Sign in to use the assistant."
              : `Assistant request failed (${response.status})`;
          setError(message);
          return null;
        }

        await readNdjsonStream(
          response.body,
          (event) => {
            switch (event.type) {
              case "thinking":
                setThinking(event.active);
                break;
              case "text_delta":
                finalText += event.text;
                setStreamingText(finalText);
                break;
              case "tool_start":
                setActiveTool(event.tool);
                break;
              case "tool_end":
                setActiveTool(null);
                break;
              case "done":
                finalText = event.text || finalText;
                setStreamingText(finalText);
                setThinking(false);
                setActiveTool(null);
                break;
              case "error":
                setError(event.error);
                setThinking(false);
                setActiveTool(null);
                break;
              default:
                break;
            }
          },
          controller.signal,
        );

        return finalText.trim() ? finalText : null;
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return finalText.trim() ? finalText : null;
        }
        const message =
          err instanceof Error ? err.message : "Assistant request failed";
        setError(message);
        return finalText.trim() ? finalText : null;
      } finally {
        setSending(false);
        setThinking(false);
        setActiveTool(null);
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    [sending],
  );

  return {
    send,
    stop,
    sending,
    streamingText,
    thinking,
    activeTool,
    error,
    clearError: () => setError(null),
  };
}
