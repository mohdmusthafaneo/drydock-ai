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
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-mvp-muted text-xs font-medium text-mvp">
        {agentName.slice(0, 1).toUpperCase()}
      </div>
      <div className="max-w-[85%] space-y-1 rounded-xl border border-white/10 bg-[#1B2435] px-4 py-3 text-sm text-slate-200">
        <p className="text-xs font-medium text-slate-400">
          {agentName}
          {isStreaming && (
            <span className="ml-2 text-brand">streaming…</span>
          )}
        </p>
        <p className="whitespace-pre-wrap break-words">
          {text || (isStreaming ? "" : "…")}
          {isStreaming && (
            <span
              className={cn(
                "ml-0.5 inline-block h-4 w-0.5 animate-pulse bg-brand align-middle",
              )}
              aria-hidden
            />
          )}
        </p>
      </div>
    </div>
  );
}
