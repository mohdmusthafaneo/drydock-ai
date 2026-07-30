import { cn } from "@/lib/utils";

type Props = {
  lastSyncLabel?: string | null;
  blindSpots?: string[];
  className?: string;
};

/**
 * Compact freshness / blind-spot strip for domain evidence pages.
 * Mirrors the dashboard briefing trust pattern without the full deck chrome.
 */
export function DataTrustStrip({
  lastSyncLabel,
  blindSpots = [],
  className,
}: Props) {
  if (!lastSyncLabel && blindSpots.length === 0) return null;

  return (
    <div
      className={cn(
        "rounded-[16px] border border-border-subtle bg-fog/60 px-4 py-2.5 text-[13px] leading-relaxed text-graphite",
        className,
      )}
      role="status"
    >
      {lastSyncLabel ? <span>As of {lastSyncLabel}</span> : null}
      {lastSyncLabel && blindSpots.length > 0 ? (
        <span className="text-dove"> · </span>
      ) : null}
      {blindSpots.length > 0 ? (
        <span className="text-ash">
          Blind spots: {blindSpots.slice(0, 3).join("; ")}
          {blindSpots.length > 3 ? ` (+${blindSpots.length - 3} more)` : ""}
        </span>
      ) : null}
    </div>
  );
}
