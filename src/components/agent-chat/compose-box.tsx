"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Square } from "lucide-react";
import { Button } from "@/components/ui/button";
import { invalidateThreadList } from "@/lib/queries/invalidate";
import { stashPendingMessage } from "@/lib/agent-chat/pending-message";
import { truncateThreadTitle } from "@/lib/agent-chat/types";
import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-kit/prompt-input";
import { PromptSuggestion } from "@/components/prompt-kit/prompt-suggestion";

export const CHAT_STARTER_SUGGESTIONS = [
  "What open bugs are in this sprint?",
  "What did the QA agent find?",
  "Any high-severity AWS findings?",
  "How ready is our latest release?",
] as const;

export function ComposeBox({
  isDone = false,
  sending = false,
  error = null,
  onSend,
  onStop,
}: {
  isDone?: boolean;
  sending?: boolean;
  error?: string | null;
  onSend: (content: string) => Promise<boolean | void>;
  onStop?: () => void;
}) {
  const [content, setContent] = useState("");

  async function send() {
    const trimmed = content.trim();
    if (!trimmed || sending) return;
    setContent("");
    await onSend(trimmed);
  }

  return (
    <div className="bg-pure-white px-3 py-2 sm:px-4 sm:py-3">
      {isDone && (
        <p className="mb-2 text-xs text-graphite">
          This conversation is archived. Send a message to reopen it.
        </p>
      )}
      <PromptInput
        value={content}
        onValueChange={setContent}
        isLoading={sending}
        onSubmit={() => void send()}
        className="flex items-end gap-2 rounded-2xl border border-border bg-input p-1.5 shadow-none"
      >
        <PromptInputTextarea
          placeholder={
            isDone
              ? "Send a message to reopen…"
              : "Ask about Jira, releases, or agent analysis…"
          }
          className="!min-h-[40px] max-h-[160px] flex-1 py-2 text-sm text-ink"
        />
        <PromptInputActions className="shrink-0 pb-0.5">
          {sending && onStop ? (
            <PromptInputAction tooltip="Stop">
              <Button
                type="button"
                size="icon"
                variant="ink"
                className="h-8 w-8 rounded-full"
                aria-label="Stop generating"
                onClick={onStop}
              >
                <Square className="h-3 w-3 fill-current" />
              </Button>
            </PromptInputAction>
          ) : (
            <PromptInputAction tooltip={isDone ? "Send & reopen" : "Send"}>
              <Button
                type="button"
                size="icon"
                variant="ink"
                className="h-8 w-8 rounded-full"
                aria-label={isDone ? "Send and reopen" : "Send"}
                disabled={sending || !content.trim()}
                onClick={() => void send()}
              >
                <ArrowUp className="h-4 w-4" />
              </Button>
            </PromptInputAction>
          )}
        </PromptInputActions>
      </PromptInput>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </div>
  );
}

export function NewChatComposer({
  onCreated,
}: {
  onCreated?: (threadId: string) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create(message: string) {
    const trimmed = message.trim();
    if (!trimmed || loading) return;

    setLoading(true);
    setError(null);

    const res = await fetch("/api/agent-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ title: truncateThreadTitle(trimmed) }),
    });

    const data = await res.json();

    if (!res.ok) {
      setLoading(false);
      setError(data.error || "Failed to start conversation");
      return;
    }

    stashPendingMessage(data.threadId, trimmed);
    await invalidateThreadList(queryClient);
    onCreated?.(data.threadId);
    router.push(`/agent-threads/${data.threadId}`);
  }

  return (
    <div className="mx-auto w-full max-w-2xl space-y-3">
      <div className="flex flex-wrap justify-center gap-2">
        {CHAT_STARTER_SUGGESTIONS.map((suggestion) => (
          <PromptSuggestion
            key={suggestion}
            variant="outline"
            size="sm"
            className="rounded-full border-border bg-pure-white text-ash"
            onClick={() => void create(suggestion)}
            disabled={loading}
          >
            {suggestion}
          </PromptSuggestion>
        ))}
      </div>
      <PromptInput
        value={content}
        onValueChange={setContent}
        isLoading={loading}
        onSubmit={() => void create(content)}
        className="flex items-end gap-2 rounded-2xl border border-border bg-input p-2 shadow-none"
      >
        <PromptInputTextarea
          placeholder="Ask DryDock anything about test signal, releases, or Jira…"
          className="!min-h-[40px] max-h-[120px] flex-1 py-2 text-sm text-ink"
          disabled={loading}
        />
        <PromptInputActions className="shrink-0 pb-0.5">
          <PromptInputAction tooltip="Send">
            <Button
              type="button"
              size="icon"
              variant="ink"
              className="h-8 w-8 rounded-full"
              aria-label="Send"
              disabled={loading || !content.trim()}
              onClick={() => void create(content)}
            >
              <ArrowUp className="h-4 w-4" />
            </Button>
          </PromptInputAction>
        </PromptInputActions>
      </PromptInput>
      {error && <p className="text-center text-sm text-error">{error}</p>}
    </div>
  );
}
