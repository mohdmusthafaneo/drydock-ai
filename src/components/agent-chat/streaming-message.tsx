"use client";

import { cn } from "@/lib/utils";

export function StreamingMessageBubble({
  agentName,
  text,
  isStreaming,
}: {
  agentName: string;
  text: string;
  isStreaming: boolean;
}) {
  return (
    <div className="flex gap-3 px-1 py-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-apricot-wash text-xs font-medium text-rust">
        {agentName.slice(0, 1).toUpperCase()}
      </div>
      <div className="max-w-[85%] space-y-1 rounded-2xl border border-border-subtle bg-pure-white px-4 py-3 text-sm text-ink">
        <p className="text-xs font-medium text-graphite">
          {agentName}
          {isStreaming && (
            <span className="ml-2 text-chart-blue">streaming…</span>
          )}
        </p>
        <p className="whitespace-pre-wrap break-words">
          {text || (isStreaming ? "" : "…")}
          {isStreaming && (
            <span
              className={cn(
                "ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-chart-blue align-middle",
              )}
              aria-hidden
            />
          )}
        </p>
      </div>
    </div>
  );
}
