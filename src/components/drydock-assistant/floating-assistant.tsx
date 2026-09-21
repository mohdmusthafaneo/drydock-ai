"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, MessageCircle, Send, X } from "lucide-react";
import { useAssistantStream } from "@/components/drydock-assistant/use-assistant-stream";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { useFilters } from "@/lib/store";
import { cn } from "@/lib/utils";

type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  text: "Hi — ask me what’s at risk this sprint, how delivery confidence looks, or what’s in the attention queue.",
};

function AssistantBubble({ text }: { text: string }) {
  return (
    <div className="max-w-[85%] rounded-[12px] border border-border bg-pure-white px-3 py-2 text-[13px] leading-5 text-secondary shadow-[0_2px_7px_rgba(16,24,40,0.025)]">
      <MarkdownContent
        content={text}
        className="[&_p]:my-0 [&_p+p]:mt-2 [&_ul]:my-1.5 [&_ol]:my-1.5"
      />
    </div>
  );
}

/** Floating DryDock assistant panel. */
export function FloatingAssistant({ className }: { className?: string }) {
  const [mounted, setMounted] = useState(false);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME]);
  const panelId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const filters = useFilters();
  const {
    send,
    sending,
    streamingText,
    thinking,
    activeTool,
    error,
    clearError,
  } = useAssistantStream();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
    if (!sending) inputRef.current?.focus();
  }, [open, messages, streamingText, sending]);

  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  async function handleSend() {
    const text = draft.trim();
    if (!text || sending) return;

    clearError();
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      text,
    };

    const history = messages
      .filter((m) => m.id !== WELCOME.id)
      .map((m) => ({
        role: m.role,
        content: m.text,
      }));

    setMessages((prev) => [...prev, userMessage]);
    setDraft("");

    const reply = await send({
      content: text,
      history,
      team: filters.team,
      sprint: filters.sprint,
    });

    if (reply) {
      setMessages((prev) => [
        ...prev,
        {
          id: `assistant-${Date.now()}`,
          role: "assistant",
          text: reply,
        },
      ]);
    }
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSend();
    }
  }

  if (!mounted) return null;

  const statusLabel = activeTool
    ? `Reading ${activeTool.replace(/_/g, " ")}…`
    : thinking
      ? "Thinking…"
      : null;

  return createPortal(
    <div
      className={cn(
        "pointer-events-none fixed bottom-[max(5.5rem,env(safe-area-inset-bottom))] right-4 z-[60] flex flex-col items-end gap-3 lg:bottom-6 lg:right-6",
        className,
      )}
    >
      {open ? (
        <section
          id={panelId}
          role="dialog"
          aria-label="DryDock assistant"
          aria-modal="false"
          className="pointer-events-auto flex h-[min(32rem,calc(100dvh-8.5rem))] w-[min(22.5rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-[14px] border border-border bg-pure-white shadow-[0_8px_28px_rgba(16,24,40,0.12)] lg:h-[min(32rem,calc(100dvh-7.5rem))]"
        >
          <header className="flex items-center justify-between gap-3 border-b border-border-soft px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-[14px] font-semibold tracking-[-0.01em] text-ink">
                DryDock assistant
              </p>
              <p className="truncate text-[11px] text-muted">
                Ask about your delivery evidence
              </p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] text-muted transition-colors hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
              aria-label="Close assistant"
            >
              <X className="h-4 w-4" strokeWidth={2} />
            </button>
          </header>

          <div
            ref={listRef}
            className="flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto bg-base px-4 py-4"
          >
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {message.role === "user" ? (
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-[12px] bg-brown-button px-3 py-2 text-[13px] leading-5 text-white">
                    {message.text}
                  </div>
                ) : (
                  <AssistantBubble text={message.text} />
                )}
              </div>
            ))}

            {sending ? (
              <div className="flex justify-start">
                <div className="max-w-[85%] rounded-[12px] border border-border bg-pure-white px-3 py-2 text-[13px] leading-5 text-secondary shadow-[0_2px_7px_rgba(16,24,40,0.025)]">
                  {streamingText ? (
                    <MarkdownContent
                      content={streamingText}
                      className="[&_p]:my-0 [&_p+p]:mt-2 [&_ul]:my-1.5 [&_ol]:my-1.5"
                    />
                  ) : (
                    <span className="inline-flex items-center gap-1.5 text-muted">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      {statusLabel ?? "Working…"}
                    </span>
                  )}
                </div>
              </div>
            ) : null}

            {error ? (
              <p className="text-[11px] text-error">{error}</p>
            ) : null}
          </div>

          <form
            className="border-t border-border-soft bg-pure-white p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void handleSend();
            }}
          >
            <div className="flex items-end gap-2 rounded-[10px] border border-border bg-pure-white px-2.5 py-2 focus-within:ring-2 focus-within:ring-accent/30">
              <textarea
                ref={inputRef}
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={onKeyDown}
                rows={1}
                placeholder="Ask DryDock…"
                disabled={sending}
                className="max-h-24 min-h-[24px] flex-1 resize-none bg-transparent py-0.5 text-[13px] text-ink placeholder:text-faint focus-visible:outline-none disabled:opacity-60"
                aria-label="Message"
              />
              <button
                type="submit"
                disabled={!draft.trim() || sending}
                className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-[8px] bg-brown-button text-white transition-opacity hover:bg-brown-button/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:pointer-events-none disabled:opacity-40"
                aria-label="Send message"
              >
                {sending ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" strokeWidth={2.25} />
                ) : (
                  <Send className="h-3.5 w-3.5" strokeWidth={2.25} />
                )}
              </button>
            </div>
          </form>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-label={open ? "Close DryDock assistant" : "Open DryDock assistant"}
        className={cn(
          "pointer-events-auto inline-flex h-12 w-12 items-center justify-center rounded-full text-white shadow-[0_6px_18px_rgba(136,71,43,0.35)] transition-transform hover:scale-[1.03] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2",
          open ? "bg-ink" : "bg-brown-button hover:bg-brown-button/90",
        )}
      >
        {open ? (
          <X className="h-5 w-5" strokeWidth={2} />
        ) : (
          <MessageCircle className="h-5 w-5" strokeWidth={2} />
        )}
      </button>
    </div>,
    document.body,
  );
}
