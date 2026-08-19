"use client";

import { useState } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";
import { cn } from "@/lib/utils";

type FeedbackValue = "thumbs_up" | "thumbs_down";

type MessageFeedbackProps = {
  messageId: string;
  threadId: string;
  currentFeedback?: string | null;
};

export function MessageFeedback({
  messageId,
  threadId,
  currentFeedback,
}: MessageFeedbackProps) {
  const [feedback, setFeedback] = useState<FeedbackValue | null>(
    currentFeedback as FeedbackValue | null,
  );
  const [loading, setLoading] = useState(false);

  async function submit(value: FeedbackValue) {
    if (loading) return;
    const next = feedback === value ? null : value;
    setFeedback(next);
    setLoading(true);
    try {
      await fetch(
        `/api/agent-threads/${threadId}/messages/${messageId}/feedback`,
        {
          method: "PATCH",
          credentials: "same-origin",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ feedback: value }),
        },
      );
    } catch {
      // Revert on error
      setFeedback(feedback);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label="Thumbs up"
        disabled={loading}
        onClick={() => void submit("thumbs_up")}
        className={cn(
          "rounded p-1 transition-colors",
          feedback === "thumbs_up"
            ? "text-green-600 bg-green-50"
            : "text-graphite hover:bg-hover hover:text-ink",
        )}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        type="button"
        aria-label="Thumbs down"
        disabled={loading}
        onClick={() => void submit("thumbs_down")}
        className={cn(
          "rounded p-1 transition-colors",
          feedback === "thumbs_down"
            ? "text-red-600 bg-red-50"
            : "text-graphite hover:bg-hover hover:text-ink",
        )}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
