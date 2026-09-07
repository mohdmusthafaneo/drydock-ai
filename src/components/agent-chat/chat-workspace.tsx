"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Menu, MessageSquarePlus, X } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useAgentThreadQuery,
  useAgentThreadsQuery,
} from "@/lib/queries/threads";
import { plainChatPreview } from "@/lib/agent-chat/preview-text";
import { Button } from "@/components/ui/button";
import { ThreadStatusBadge } from "@/components/agent-chat/thread-status-badge";
import { SlackOriginBadge } from "@/components/agent-chat/slack-origin-badge";
import { ThreadDetailPanel } from "@/components/agent-chat/thread-detail-panel";
import { NewChatComposer } from "@/components/agent-chat/compose-box";

type ChatWorkspaceProps = {
  threadId?: string;
};

function useChatAssistantWarmup() {
  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/agent-chat/warmup", {
      method: "POST",
      credentials: "same-origin",
      signal: controller.signal,
    }).catch(() => {
      // Best-effort — chat still works if warmup fails.
    });
    return () => controller.abort();
  }, []);
}

function ConversationSidebar({
  activeThreadId,
  onNavigate,
  showNewButton = true,
}: {
  activeThreadId?: string;
  onNavigate?: () => void;
  showNewButton?: boolean;
}) {
  const { data, isLoading } = useAgentThreadsQuery("open");
  const archived = useAgentThreadsQuery("done");
  const threads = data?.threads ?? [];
  const archivedThreads = archived.data?.threads ?? [];

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between gap-2 px-3 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-graphite">
          Chats
        </p>
        {showNewButton ? (
          <Button asChild variant="ink" size="sm" className="h-8 rounded-full px-3">
            <Link href="/agent-threads" onClick={onNavigate}>
              <MessageSquarePlus className="mr-1.5 h-3.5 w-3.5" />
              New
            </Link>
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-3">
        {isLoading ? (
          <p className="px-2 py-4 text-xs text-graphite">Loading…</p>
        ) : threads.length === 0 && archivedThreads.length === 0 ? (
          <p className="px-2 py-4 text-xs text-graphite">No chats yet</p>
        ) : (
          <div className="space-y-1">
            {threads.map((thread) => (
              <SidebarThreadLink
                key={thread.id}
                id={thread.id}
                title={thread.title}
                preview={thread.messages[0]?.contentMarkdown}
                active={activeThreadId === thread.id}
                externalSource={thread.externalSource}
                onNavigate={onNavigate}
              />
            ))}
            {archivedThreads.length > 0 ? (
              <>
                <p className="px-2 pb-1 pt-4 text-[10px] font-medium uppercase tracking-wide text-dove">
                  Archived
                </p>
                {archivedThreads.slice(0, 12).map((thread) => (
                  <SidebarThreadLink
                    key={thread.id}
                    id={thread.id}
                    title={thread.title}
                    preview={thread.messages[0]?.contentMarkdown}
                    active={activeThreadId === thread.id}
                    archived
                    externalSource={thread.externalSource}
                    onNavigate={onNavigate}
                  />
                ))}
              </>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}

function SidebarThreadLink({
  id,
  title,
  preview,
  active,
  archived,
  externalSource,
  onNavigate,
}: {
  id: string;
  title: string;
  preview?: string;
  active?: boolean;
  archived?: boolean;
  externalSource?: string | null;
  onNavigate?: () => void;
}) {
  const cleaned = preview ? plainChatPreview(preview) : "";
  const showPreview =
    cleaned &&
    cleaned.toLowerCase() !== title.trim().toLowerCase();

  return (
    <Link
      href={`/agent-threads/${id}`}
      onClick={onNavigate}
      className={cn(
        "block rounded-xl px-3 py-2.5 transition-colors",
        active
          ? "bg-sky-wash text-ink"
          : "text-ash hover:bg-hover hover:text-ink",
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium">{title}</p>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {externalSource ? <SlackOriginBadge source={externalSource} /> : null}
          {archived ? <ThreadStatusBadge status="done" /> : null}
        </div>
      </div>
      {showPreview ? (
        <p className="mt-0.5 truncate text-xs text-graphite">{cleaned}</p>
      ) : null}
    </Link>
  );
}

function NewChatEmpty() {
  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center px-4 pb-6">
      <div className="w-full max-w-xl space-y-5">
        <div className="text-center">
          <h1 className="font-display text-[28px] leading-tight tracking-[-0.28px] text-ink sm:text-[34px]">
            DryDock
          </h1>
          <p className="mt-2 text-sm text-ash">
            Ask about which greens are trustworthy, releases, Jira, or agent analysis runs.
          </p>
        </div>
        <NewChatComposer />
      </div>
    </div>
  );
}

export function ChatWorkspace({ threadId }: ChatWorkspaceProps) {
  useChatAssistantWarmup();
  const pathname = usePathname();
  const [historyOpen, setHistoryOpen] = useState(false);
  const isNew = !threadId;
  const detail = useAgentThreadQuery(threadId ?? "");
  const title = useMemo(() => {
    if (isNew) return "New chat";
    return detail.data?.thread.title?.trim() || "Chat";
  }, [isNew, detail.data?.thread.title]);

  return (
    <div className="absolute inset-0 flex overflow-hidden rounded-none bg-base pb-[calc(4.25rem+env(safe-area-inset-bottom,0px))] lg:rounded-[var(--radius-card)] lg:border lg:border-border lg:bg-pure-white lg:pb-0">
      {/* Desktop history rail */}
      <aside className="hidden w-[260px] shrink-0 border-r border-border-subtle bg-fog/80 lg:flex lg:flex-col">
        <ConversationSidebar activeThreadId={threadId} />
      </aside>

      {/* Mobile history drawer — always mounted so open/close is reliable */}
      <div
        className={cn(
          "absolute inset-0 z-20 lg:hidden",
          historyOpen
            ? "pointer-events-auto"
            : "pointer-events-none invisible",
        )}
        aria-hidden={!historyOpen}
      >
        <button
          type="button"
          className={cn(
            "absolute inset-0 bg-ink/25 transition-opacity",
            historyOpen ? "opacity-100" : "opacity-0",
          )}
          aria-label="Close history"
          tabIndex={historyOpen ? 0 : -1}
          onClick={() => setHistoryOpen(false)}
        />
        <aside
          className={cn(
            "absolute inset-y-0 left-0 flex w-[min(86vw,300px)] flex-col border-r border-border-subtle bg-pure-white shadow-lg transition-transform duration-200",
            historyOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="flex shrink-0 items-center justify-between border-b border-border-subtle px-3 py-2">
            <p className="text-sm font-medium text-ink">Chats</p>
            <button
              type="button"
              className="rounded-lg p-2 text-graphite hover:bg-hover hover:text-ink"
              onClick={() => setHistoryOpen(false)}
              aria-label="Close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1">
            <ConversationSidebar
              activeThreadId={threadId}
              onNavigate={() => setHistoryOpen(false)}
              showNewButton
            />
          </div>
        </aside>
      </div>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center gap-2 border-b border-border-subtle px-3 py-2 lg:hidden">
          <button
            type="button"
            className="rounded-lg p-2 text-graphite hover:bg-hover hover:text-ink"
            onClick={() => setHistoryOpen(true)}
            aria-label="Open chat history"
          >
            <Menu className="h-4 w-4" />
          </button>
          <p className="min-w-0 flex-1 truncate text-sm font-medium text-ink">
            {title}
          </p>
          {!pathname.endsWith("/agent-threads") ? (
            <Button asChild variant="ghost" size="sm" className="h-8 px-2">
              <Link href="/agent-threads">New</Link>
            </Button>
          ) : null}
        </div>

        <div className="min-h-0 flex-1">
          {threadId ? (
            <ThreadDetailPanel key={threadId} threadId={threadId} />
          ) : (
            <NewChatEmpty />
          )}
        </div>
      </div>
    </div>
  );
}
