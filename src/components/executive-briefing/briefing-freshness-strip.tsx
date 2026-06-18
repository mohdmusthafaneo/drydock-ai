import { formatDistanceToNow } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import type { ExecutiveBriefing } from "@/lib/executive-briefing/types";

type Props = {
  freshness: ExecutiveBriefing["freshness"];
  className?: string;
  variant?: "inline" | "banner";
};

export function BriefingFreshnessStrip({
  freshness,
  className,
  variant = "inline",
}: Props) {
  const asOfDate = new Date(freshness.asOf);

  if (variant === "banner" && freshness.stale) {
    return (
      <div
        className={cn(
          "rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-warning",
          className,
        )}
        role="status"
      >
        <p className="font-medium">Integration data may be stale</p>
        <p className="mt-1 text-warning/90">
          {freshness.staleSources.join(", ")} last synced over 24 hours ago. Data as of{" "}
          {formatDistanceToNow(asOfDate)} — re-sync sources for current delivery and stability
          signals.
        </p>
      </div>
    );
  }

  return (
    <p className={cn("text-sm text-muted", className)}>
      Data as of {formatDistanceToNow(asOfDate)}
      {freshness.stale && (
        <span className="ml-2 text-warning">
          · {freshness.staleSources.join(", ")} data may be stale
        </span>
      )}
    </p>
  );
}
