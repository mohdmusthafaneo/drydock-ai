import Link from "next/link";
import type { AgentRunFreshness } from "@/lib/agent-analysis/types";
import { cn } from "@/lib/utils";

function formatRelative(iso: string | null): string {
  if (!iso) return "never";
  const ms = Date.now() - new Date(iso).getTime();
  if (Number.isNaN(ms)) return "unknown";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

/**
 * Compact strip under the executive briefing meta line so leaders see which
 * agent domains are live vs missing without opening each analysis page.
 */
export function AgentFreshnessStrip({
  freshness,
  className,
}: {
  freshness: AgentRunFreshness[];
  className?: string;
}) {
  if (freshness.length === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ash",
        className,
      )}
    >
      <span className="font-medium uppercase tracking-[0.04em] text-graphite">
        Agents
      </span>
      {freshness.map((row) => {
        const live = Boolean(row.analyzedAt);
        const tone = !live
          ? "text-graphite"
          : row.stale
            ? "text-rust"
            : "text-success";
        const mark = !live ? "—" : row.stale ? "stale" : "✓";
        return (
          <Link
            key={row.domain}
            href={row.href}
            className={cn("inline-flex items-center gap-1 hover:text-ink", tone)}
          >
            <span className="font-medium text-ink/80">{row.label}</span>
            <span aria-hidden>{mark}</span>
            <span className="text-graphite">
              {live ? formatRelative(row.analyzedAt) : "not configured"}
            </span>
          </Link>
        );
      })}
    </div>
  );
}
