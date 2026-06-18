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
          "rounded-[16px] border border-dove bg-apricot-wash/50 px-4 py-3 text-[14px] text-ash",
          className,
        )}
        role="status"
      >
        <p className="font-medium text-ink">Integration data may be stale</p>
        <p className="mt-1 leading-relaxed">
          {freshness.staleSources.join(", ")} last synced over 24 hours ago. Data as of{" "}
          {formatDistanceToNow(asOfDate)} — re-sync sources for current delivery and stability
          signals.
        </p>
      </div>
    );
  }

  return (
    <p className={cn("text-[14px] text-graphite", className)}>
      As of {formatDistanceToNow(asOfDate)}
      {freshness.stale && (
        <span className="ml-2 text-rust">
          · {freshness.staleSources.join(", ")} may be stale
        </span>
      )}
    </p>
  );
}
