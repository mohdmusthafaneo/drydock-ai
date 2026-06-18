import Link from "next/link";
import type { AgentChatThreadStatus } from "@/generated/prisma/client";
import { Card, CardContent } from "@/components/ui/card";
import { ThreadStatusBadge } from "@/components/agent-chat/thread-status-badge";
import { cn } from "@/lib/utils";

export type ThreadListItem = {
  id: string;
  title: string;
  status: AgentChatThreadStatus;
  updatedAt: Date | string;
  _count: { messages: number; participants: number };
  messages: {
    contentMarkdown: string;
    kind: string;
  }[];
};

export function ThreadListTabs({
  active,
}: {
  active: "open" | "done";
}) {
  const tabs = [
    { id: "open" as const, label: "Open", href: "/agent-threads?status=open" },
    { id: "done" as const, label: "Done", href: "/agent-threads?status=done" },
  ];

  return (
    <div className="flex gap-2">
      {tabs.map((tab) => (
        <Link
          key={tab.id}
          href={tab.href}
          className={cn(
            "rounded-full px-4 py-2 text-sm transition-colors",
            active === tab.id
              ? "bg-sky-wash text-chart-blue"
              : "text-graphite hover:bg-hover hover:text-ink",
          )}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

export function ThreadList({
  threads,
  emptyLabel,
}: {
  threads: ThreadListItem[];
  emptyLabel: string;
}) {
  if (threads.length === 0) {
    return (
      <Card className="border-dashed border-dove">
        <CardContent className="py-12 text-center">
          <p className="text-sm text-graphite">{emptyLabel}</p>
          <Link
            href="/agent-threads/new"
            className="mt-4 inline-block text-sm font-medium text-ink underline-offset-4 hover:underline"
          >
            Start a new thread
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {threads.map((thread) => {
        const preview = thread.messages[0]?.contentMarkdown;
        return (
          <Link key={thread.id} href={`/agent-threads/${thread.id}`}>
            <Card className="transition-colors hover:border-chart-blue/30">
              <CardContent className="flex items-start justify-between gap-4 py-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-ink">{thread.title}</p>
                  {preview && (
                    <p className="mt-1 truncate text-sm text-ash">{preview}</p>
                  )}
                  <p className="mt-2 text-xs text-graphite">
                    {thread._count.messages} message
                    {thread._count.messages === 1 ? "" : "s"} ·{" "}
                    {thread._count.participants} participant
                    {thread._count.participants === 1 ? "" : "s"} ·{" "}
                    {new Date(thread.updatedAt).toLocaleString()}
                  </p>
                </div>
                <ThreadStatusBadge status={thread.status} />
              </CardContent>
            </Card>
          </Link>
        );
      })}
    </div>
  );
}
