import { formatDistanceToNow } from "@/lib/format-date";
import { Activity, CheckCircle2, GitBranch, Plug, Radio } from "lucide-react";

export type TimelineItem = {
  id: string;
  type: string;
  title: string;
  description?: string | null;
  at: Date;
};

const ICONS: Record<string, typeof Activity> = {
  "telemetry.ingested": Radio,
  "telemetry.collected": Radio,
  "approval": CheckCircle2,
  "release": GitBranch,
  "integration": Plug,
};

export function OperationalTimeline({
  items,
  emptyMessage = "No operational events yet. Connect integrations and run telemetry collection.",
}: {
  items: TimelineItem[];
  emptyMessage?: string;
}) {
  if (items.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-border bg-elevated/40 px-4 py-8 text-center text-sm text-muted">
        {emptyMessage}
      </p>
    );
  }

  return (
    <ul className="space-y-0">
      {items.map((item, i) => {
        const Icon = ICONS[item.type.split(".")[0] ?? ""] ?? Activity;
        return (
          <li key={item.id} className="relative flex gap-3 pb-6 last:pb-0">
            {i < items.length - 1 && (
              <span
                className="absolute left-[11px] top-6 h-[calc(100%-12px)] w-px bg-border"
                aria-hidden
              />
            )}
            <span className="relative z-[1] flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border bg-surface">
              <Icon className="h-3.5 w-3.5 text-brand" />
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-medium text-primary">{item.title}</p>
              {item.description && (
                <p className="mt-0.5 text-xs text-secondary line-clamp-2">{item.description}</p>
              )}
              <p className="mt-1 text-[11px] text-muted">{formatDistanceToNow(item.at)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
