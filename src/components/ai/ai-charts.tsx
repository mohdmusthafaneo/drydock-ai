import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type {
  CursorAgentEditPoint,
  CursorDauPoint,
  CursorExtensionTotal,
  CursorModelTotal,
} from "@/lib/cursor-api/types";
import { cn } from "@/lib/utils";

const SERIES_COLORS = {
  total: "#4D91EE",
  cloud: "#35B982",
  bugbot: "#F3BD29",
  suggested: "#E6E8EB",
  accepted: "#F4773D",
} as const;

const BAR_COLORS = ["#F4773D", "#4D91EE", "#35B982", "#8874E8", "#F3BD29"] as const;

function formatShortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function AiDauChart({ points }: { points: CursorDauPoint[] }) {
  if (points.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Daily active users</CardTitle>
          <CardDescription>Team Cursor DAU by surface</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyChart />
        </CardContent>
      </Card>
    );
  }

  const max = Math.max(
    ...points.flatMap((p) => [p.dau, p.cloud_agent_dau, p.bugbot_dau]),
    1,
  );

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Daily active users</CardTitle>
        <CardDescription>Team Cursor DAU by surface</CardDescription>
      </CardHeader>
      <CardContent>
        <GroupedBars
          categories={points.map((p) => formatShortDate(p.date))}
          series={[
            {
              name: "Total",
              color: SERIES_COLORS.total,
              values: points.map((p) => p.dau),
            },
            {
              name: "Cloud agent",
              color: SERIES_COLORS.cloud,
              values: points.map((p) => p.cloud_agent_dau),
            },
            {
              name: "Bugbot",
              color: SERIES_COLORS.bugbot,
              values: points.map((p) => p.bugbot_dau),
            },
          ]}
          max={max}
        />
      </CardContent>
    </Card>
  );
}

export function AiAgentEditsChart({ points }: { points: CursorAgentEditPoint[] }) {
  if (points.length === 0) {
    return (
      <Card className="h-full">
        <CardHeader>
          <CardTitle>Agent edits</CardTitle>
          <CardDescription>Suggested vs accepted diffs</CardDescription>
        </CardHeader>
        <CardContent>
          <EmptyChart />
        </CardContent>
      </Card>
    );
  }

  const max = Math.max(
    ...points.flatMap((p) => [p.total_suggested_diffs, p.total_accepted_diffs]),
    1,
  );

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Agent edits</CardTitle>
        <CardDescription>Suggested vs accepted diffs</CardDescription>
      </CardHeader>
      <CardContent>
        <GroupedBars
          categories={points.map((p) => formatShortDate(p.event_date))}
          series={[
            {
              name: "Suggested",
              color: SERIES_COLORS.suggested,
              values: points.map((p) => p.total_suggested_diffs),
            },
            {
              name: "Accepted",
              color: SERIES_COLORS.accepted,
              values: points.map((p) => p.total_accepted_diffs),
            },
          ]}
          max={max}
        />
      </CardContent>
    </Card>
  );
}

export function AiModelsChart({ models }: { models: CursorModelTotal[] }) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Messages by model</CardTitle>
        <CardDescription>Team totals across the sample window</CardDescription>
      </CardHeader>
      <CardContent>
        {models.length === 0 ? (
          <EmptyChart />
        ) : (
          <HorizontalBars
            items={models.map((m, i) => ({
              label: m.model,
              value: m.messages,
              color: BAR_COLORS[i % BAR_COLORS.length]!,
            }))}
          />
        )}
      </CardContent>
    </Card>
  );
}

export function AiExtensionsChart({
  extensions,
}: {
  extensions: CursorExtensionTotal[];
}) {
  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle>Top file extensions</CardTitle>
        <CardDescription>Lines accepted from AI suggestions</CardDescription>
      </CardHeader>
      <CardContent>
        {extensions.length === 0 ? (
          <EmptyChart />
        ) : (
          <HorizontalBars
            items={extensions.map((ext, i) => ({
              label: `.${ext.extension}`,
              value: ext.linesAccepted,
              color: BAR_COLORS[i % BAR_COLORS.length]!,
            }))}
          />
        )}
      </CardContent>
    </Card>
  );
}

function EmptyChart() {
  return (
    <div className="flex min-h-[160px] items-center justify-center rounded-[9px] border border-dashed border-border bg-elevated/30 text-[13px] text-muted">
      No samples in this window
    </div>
  );
}

function GroupedBars({
  categories,
  series,
  max,
}: {
  categories: string[];
  series: Array<{ name: string; color: string; values: number[] }>;
  max: number;
}) {
  return (
    <div>
      <div className="flex items-end gap-2 sm:gap-3" style={{ minHeight: 160 }}>
        {categories.map((label, index) => (
          <div
            key={`${label}-${index}`}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
          >
            <div
              className="flex w-full max-w-[56px] items-end gap-0.5"
              style={{ height: 140 }}
            >
              {series.map((s) => {
                const value = s.values[index] ?? 0;
                const height = (value / max) * 100;
                return (
                  <div
                    key={s.name}
                    className="flex-1 rounded-t"
                    style={{
                      height: `${Math.max(height, value > 0 ? 2 : 0)}%`,
                      backgroundColor: s.color,
                    }}
                    title={`${s.name}: ${value.toLocaleString()}`}
                  />
                );
              })}
            </div>
            <span className="max-w-full truncate text-[10px] text-muted">
              {label}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-4 text-[12px] text-secondary">
        {series.map((s) => (
          <span key={s.name} className="inline-flex items-center gap-1.5">
            <span
              className="h-2 w-2 rounded-sm"
              style={{ backgroundColor: s.color }}
            />
            {s.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function HorizontalBars({
  items,
}: {
  items: Array<{ label: string; value: number; color: string }>;
}) {
  const max = Math.max(...items.map((item) => item.value), 1);
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item.label} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1">
          <span className="truncate text-[13px] text-secondary">{item.label}</span>
          <span className="text-[12px] font-medium tabular-nums text-ink">
            {item.value.toLocaleString()}
          </span>
          <div className={cn("col-span-2 h-2 overflow-hidden rounded-full bg-elevated")}>
            <div
              className="h-full rounded-full"
              style={{
                width: `${(item.value / max) * 100}%`,
                backgroundColor: item.color,
              }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
