"use client";

import { cn } from "@/lib/utils";

type SlackOriginBadgeProps = {
  /** The externalSource value from the thread, e.g. "slack" */
  source: string | null;
  className?: string;
};

/**
 * Renders a small badge indicating the thread originated from an external
 * channel (e.g. Slack). Currently only Slack is distinguished.
 */
export function SlackOriginBadge({ source, className }: SlackOriginBadgeProps) {
  if (!source) return null;

  const isSlack = source.toLowerCase() === "slack";
  if (!isSlack) return null;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded bg-[#E01E5A]/10 px-1.5 py-0.5",
        "text-[10px] font-medium uppercase tracking-wide text-[#E01E5A]",
        className,
      )}
      title={`Originated from ${source}`}
    >
      <svg
        viewBox="0 0 24 24"
        fill="currentColor"
        className="h-3 w-3 flex-shrink-0"
        aria-hidden="true"
      >
        {/* Slack mark — simplified icon */}
        <path d="M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z" />
      </svg>
      Slack
    </span>
  );
}
