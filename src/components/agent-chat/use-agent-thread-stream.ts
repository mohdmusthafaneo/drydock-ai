"use client";

import { useCallback, useRef, useState } from "react";
import type { ThoughtToolState } from "@/components/agent-chat/thought-panel";
import type { ChatStreamEvent, ReasoningJson } from "@/lib/agent-chat/types";

export type StreamingMessageState = {
  messageId: string;
  text: string;
  isStreaming: boolean;
  thinking: boolean;
  thinkingText?: string;
  tools?: ThoughtToolState[];
  activeTool?: string;
};

export type OptimisticHumanMessage = {
  id: string;
  content: string;
};

type UseAgentThreadStreamOptions = {
  onMessageFinal?: (messageId: string) => void;
  onHumanMessageSaved?: (messageId: string) => void;
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

function toolsFromDoneEvent(
  tools: ReasoningJson["tools"] | undefined,
): ThoughtToolState[] | undefined {
  if (!tools?.length) return undefined;
  return tools.map((tool) => ({
    name: tool.name,
    input: tool.input,
    outputPreview: tool.outputPreview,
    toolCallId: tool.toolCallId,
    errorText: tool.isError ? tool.outputPreview : undefined,
    state: tool.isError
      ? ("output-error" as const)
      : tool.endedAt
        ? ("output-available" as const)
        : ("input-streaming" as const),
  }));
}

export function useAgentThreadStream(
  threadId: string,
  options: UseAgentThreadStreamOptions = {},
) {
  const { onMessageFinal, onHumanMessageSaved } = options;
  const [streaming, setStreaming] = useState<StreamingMessageState | null>(null);
  const [optimisticHuman, setOptimisticHuman] =
    useState<OptimisticHumanMessage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const sendingRef = useRef(false);
  const onMessageFinalRef = useRef(onMessageFinal);
  const onHumanMessageSavedRef = useRef(onHumanMessageSaved);
  onMessageFinalRef.current = onMessageFinal;
  onHumanMessageSavedRef.current = onHumanMessageSaved;

  const clearStreaming = useCallback(() => {
    setStreaming(null);
    setOptimisticHuman(null);
  }, []);

  const stop = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    sendingRef.current = false;
    setSending(false);
    setStreaming((prev) =>
      prev
        ? {
            ...prev,
            isStreaming: false,
            thinking: false,
            tools: prev.tools?.map((tool) =>
              tool.state === "input-streaming"
                ? { ...tool, state: "output-available" as const }
                : tool,
            ),
          }
        : null,
    );
  }, []);

  const runStream = useCallback(
    async (
      body: Record<string, unknown>,
      optimisticContent?: string,
    ): Promise<boolean> => {
      if (!threadId || sendingRef.current) return false;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      sendingRef.current = true;

      setSending(true);
      setError(null);
      if (optimisticContent) {
        setOptimisticHuman({
          id: `optimistic-${Date.now()}`,
          content: optimisticContent,
        });
      }
      setStreaming({
        messageId: `pending-${Date.now()}`,
        text: "",
        isStreaming: true,
        thinking: true,
        thinkingText: "",
        tools: [],
      });

      try {
        const res = await fetch(`/api/agent-threads/${threadId}/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errBody = (await res.json().catch(() => null)) as
            | { error?: string }
            | null;
          throw new Error(errBody?.error ?? `Request failed (${res.status})`);
        }

        if (!res.body) {
          throw new Error("No response stream");
        }

        await readNdjsonStream(
          res.body,
          (event) => {
            switch (event.type) {
              case "message_saved":
                setOptimisticHuman((prev) =>
                  prev ? { ...prev, id: event.messageId } : prev,
                );
                onHumanMessageSavedRef.current?.(event.messageId);
                break;
              case "thinking":
                setStreaming((prev) =>
                  prev
                    ? { ...prev, thinking: event.active, isStreaming: true }
                    : prev,
                );
                break;
              case "thinking_delta":
                setStreaming((prev) =>
                  prev
                    ? {
                        ...prev,
                        thinking: true,
                        thinkingText: (prev.thinkingText ?? "") + event.text,
                        isStreaming: true,
                      }
                    : {
                        messageId: `pending-${Date.now()}`,
                        text: "",
                        thinking: true,
                        thinkingText: event.text,
                        tools: [],
                        isStreaming: true,
                      },
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
                        tools: [],
                        isStreaming: true,
                      },
                );
                break;
              case "tool_start":
                setStreaming((prev) => {
                  const nextTool: ThoughtToolState = {
                    name: event.tool,
                    input: event.input,
                    toolCallId: event.toolCallId,
                    state: "input-streaming",
                  };
                  if (!prev) {
                    return {
                      messageId: `pending-${Date.now()}`,
                      text: "",
                      thinking: true,
                      thinkingText: "",
                      tools: [nextTool],
                      activeTool: event.tool,
                      isStreaming: true,
                    };
                  }
                  return {
                    ...prev,
                    thinking: true,
                    activeTool: event.tool,
                    tools: [...(prev.tools ?? []), nextTool],
                    isStreaming: true,
                  };
                });
                break;
              case "tool_end":
                setStreaming((prev) => {
                  if (!prev) return prev;
                  const tools = [...(prev.tools ?? [])];
                  const matchIdx = (() => {
                    const byId = tools.findIndex(
                      (t) => t.toolCallId === event.toolCallId,
                    );
                    if (byId >= 0) return byId;
                    for (let i = tools.length - 1; i >= 0; i -= 1) {
                      const t = tools[i];
                      if (
                        t &&
                        t.name === event.tool &&
                        t.state === "input-streaming"
                      )
                        return i;
                    }
                    return -1;
                  })();
                  if (matchIdx >= 0) {
                    const tool = tools[matchIdx]!;
                    tools[matchIdx] = {
                      ...tool,
                      state: event.isError
                        ? "output-error"
                        : "output-available",
                      outputPreview: event.outputPreview,
                      errorText: event.isError
                        ? event.outputPreview
                        : tool.errorText,
                      toolCallId: event.toolCallId ?? tool.toolCallId,
                    };
                  }
                  return {
                    ...prev,
                    activeTool: undefined,
                    tools,
                    isStreaming: true,
                  };
                });
                break;
              case "done":
                setStreaming({
                  messageId: event.messageId,
                  text: event.text,
                  isStreaming: false,
                  thinking: false,
                  thinkingText: event.thinking,
                  tools: toolsFromDoneEvent(event.tools),
                });
                onMessageFinalRef.current?.(event.messageId);
                break;
              case "error":
                setError(event.error);
                setStreaming((prev) =>
                  prev
                    ? { ...prev, isStreaming: false, thinking: false }
                    : prev,
                );
                break;
            }
          },
          controller.signal,
        );
        return !controller.signal.aborted;
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          setError(null);
          return false;
        }
        setError(err instanceof Error ? err.message : "Failed to send message");
        setStreaming((prev) =>
          prev ? { ...prev, isStreaming: false, thinking: false } : null,
        );
        return false;
      } finally {
        sendingRef.current = false;
        setSending(false);
        abortRef.current = null;
      }
    },
    [threadId],
  );

  const sendMessage = useCallback(
    async (content: string) => {
      const trimmed = content.trim();
      if (!trimmed) return false;
      return runStream({ content: truncatedSafe(trimmed) }, trimmed);
    },
    [runStream],
  );

  const regenerate = useCallback(async () => {
    return runStream({ regenerate: true });
  }, [runStream]);

  return {
    streaming,
    streamingMessages: streaming ? [streaming] : [],
    optimisticHuman,
    sending,
    error,
    sendMessage,
    regenerate,
    stop,
    clearStreaming,
    connected: true,
    disconnected: false,
  };
}

function truncatedSafe(content: string) {
  return content.length > 8000 ? content.slice(0, 8000) : content;
}
