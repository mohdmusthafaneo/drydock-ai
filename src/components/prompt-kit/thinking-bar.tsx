"use client";

import { TextShimmer } from "@/components/prompt-kit/text-shimmer";
import { cn } from "@/lib/utils";
import { ChevronRight } from "lucide-react";

type ThinkingBarProps = {
  className?: string;
  text?: string;
  onStop?: () => void;
  stopLabel?: string;
  onClick?: () => void;
};

export function ThinkingBar({
  className,
  text = "Thinking",
  onStop,
  stopLabel = "Answer now",
  onClick,
}: ThinkingBarProps) {
  return (
    <div className={cn("flex items-center gap-3", className)}>
      {onClick ? (
        <button
          type="button"
          onClick={onClick}
          className="flex items-center gap-1 text-sm transition-opacity hover:opacity-80"
        >
          <TextShimmer className="text-sm" duration={2}>
            {text}
          </TextShimmer>
          <ChevronRight className="size-4 text-graphite" />
        </button>
      ) : (
        <TextShimmer className="text-sm" duration={2}>
          {text}
        </TextShimmer>
      )}
      {onStop ? (
        <button
          onClick={onStop}
          type="button"
          className="border-b border-dotted border-graphite/50 text-sm text-graphite transition-colors hover:border-ink hover:text-ink"
        >
          {stopLabel}
        </button>
      ) : null}
    </div>
  );
}
