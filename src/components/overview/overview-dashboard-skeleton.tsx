import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

function Bone({ className }: { className?: string }) {
  return <Skeleton className={cn("bg-elevated", className)} />;
}

function ChartPlotSkeleton({
  className,
  children,
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative flex h-[125px] w-full items-end gap-1 overflow-hidden rounded-[10px]",
        className,
      )}
      aria-hidden
    >
      {/* Y-axis ticks */}
      <div className="absolute inset-y-1 left-0 flex w-5 flex-col justify-between">
        <Bone className="h-1.5 w-3 rounded" />
        <Bone className="h-1.5 w-3 rounded" />
        <Bone className="h-1.5 w-3 rounded" />
        <Bone className="h-1.5 w-3 rounded" />
        <Bone className="h-1.5 w-3 rounded" />
      </div>
      <div className="ml-6 flex h-full w-full flex-col justify-end">{children}</div>
    </div>
  );
}

function AreaTrendPlotSkeleton() {
  return (
    <ChartPlotSkeleton>
      <svg viewBox="0 0 400 125" className="h-full w-full" preserveAspectRatio="none">
        <defs>
          <linearGradient id="overview-trend-skel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e6e8eb" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#e6e8eb" stopOpacity="0.15" />
          </linearGradient>
        </defs>
        <path
          d="M0 95 C40 88, 70 70, 100 75 S160 100, 200 85 S280 40, 320 55 S370 70, 400 48 L400 125 L0 125 Z"
          fill="url(#overview-trend-skel)"
          className="animate-pulse"
        />
        <path
          d="M0 95 C40 88, 70 70, 100 75 S160 100, 200 85 S280 40, 320 55 S370 70, 400 48"
          fill="none"
          stroke="#d0d5dd"
          strokeWidth="2"
          strokeLinecap="round"
          className="animate-pulse"
        />
      </svg>
    </ChartPlotSkeleton>
  );
}

function BurndownPlotSkeleton() {
  return (
    <ChartPlotSkeleton>
      <svg viewBox="0 0 400 125" className="h-full w-full" preserveAspectRatio="none">
        <line
          x1="8"
          y1="18"
          x2="392"
          y2="108"
          stroke="#d0d5dd"
          strokeWidth="1.5"
          strokeDasharray="5 4"
          className="animate-pulse"
        />
        <path
          d="M8 22 L70 35 L140 48 L210 62 L280 78 L350 95 L392 108"
          fill="none"
          stroke="#c8ced6"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="animate-pulse"
        />
        {[70, 140, 210, 280, 350].map((x, i) => (
          <circle
            key={x}
            cx={x}
            cy={[35, 48, 62, 78, 95][i]}
            r="4"
            fill="#e6e8eb"
            className="animate-pulse"
          />
        ))}
      </svg>
    </ChartPlotSkeleton>
  );
}

function HeatmapPlotSkeleton() {
  const cols = 14;
  const rows = 4;
  return (
    <div className="space-y-2 pt-1" aria-hidden>
      <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
        {Array.from({ length: rows * cols }).map((_, i) => (
          <Bone
            key={i}
            className="aspect-square min-h-[14px] rounded-[3px]"
            // stagger opacity slightly via animation delay isn't needed — pulse is enough
          />
        ))}
      </div>
      <div className="flex justify-between gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Bone key={i} className="h-2 w-6 rounded" />
        ))}
      </div>
    </div>
  );
}

function GaugeSkeleton() {
  return (
    <div className="flex flex-col items-center" aria-hidden>
      <div className="relative h-[168px] w-[168px]">
        <div className="absolute inset-0 rounded-full border-[14px] border-elevated animate-pulse" />
        <div className="absolute inset-[18px] flex flex-col items-center justify-center gap-2">
          <Bone className="h-10 w-16 rounded-md" />
          <Bone className="h-3 w-12 rounded" />
        </div>
      </div>
      <Bone className="mt-[22px] h-4 w-40 rounded" />
    </div>
  );
}

function MetricRowSkeleton() {
  return (
    <div className="grid grid-cols-[36px_105px_1fr_46px] items-center gap-2.5" aria-hidden>
      <Bone className="h-[34px] w-[34px] rounded-[9px]" />
      <div className="space-y-1.5">
        <Bone className="h-4 w-12 rounded" />
        <Bone className="h-2.5 w-16 rounded" />
      </div>
      <Bone className="h-2 w-full rounded-full" />
      <Bone className="ml-auto h-2.5 w-8 rounded" />
    </div>
  );
}

function DeliveryConfidenceSkeleton() {
  return (
    <Card
      className="min-h-[320px] rounded-[var(--radius-card)] border-border px-[21px] pt-[22px] pb-[18px] shadow-[var(--shadow)]"
      data-slot="delivery-confidence-skeleton"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-2">
          <Bone className="h-4 w-40 rounded" />
          <Bone className="h-3 w-56 rounded" />
        </div>
        <Bone className="h-[33px] w-[128px] rounded-[9px]" />
      </div>
      <div className="mt-0 grid min-h-[245px] gap-7 sm:grid-cols-[1.02fr_0.98fr] sm:items-center">
        <GaugeSkeleton />
        <ul className="grid gap-4 border-t border-border pt-4 sm:border-t-0 sm:border-l sm:pt-0 sm:pl-[21px]">
          {Array.from({ length: 4 }).map((_, i) => (
            <li key={i}>
              <MetricRowSkeleton />
            </li>
          ))}
        </ul>
      </div>
    </Card>
  );
}

function KeyTakeawaysSkeleton() {
  return (
    <Card
      className="rounded-[var(--radius-card)] border-border px-5 pt-5 pb-2.5 shadow-[var(--shadow)]"
      data-slot="key-takeaways-skeleton"
    >
      <div className="flex items-center border-b border-border pb-[11px]">
        <Bone className="h-4 w-32 rounded" />
      </div>
      <ul className="mt-3 space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <li key={i} className="flex items-start gap-3">
            <Bone className="mt-0.5 h-7 w-7 shrink-0 rounded-[8px]" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Bone className="h-3 w-full rounded" />
              <Bone className="h-3 w-[85%] rounded" />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function ScoreBreakdownSkeleton() {
  return (
    <Card
      className="rounded-[var(--radius-card)] border-border px-[18px] pt-4 pb-2.5 shadow-[var(--shadow)]"
      data-slot="score-breakdown-skeleton"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2.5">
          <Bone className="h-4 w-36 rounded" />
          <Bone className="hidden h-3 w-48 rounded sm:block" />
        </div>
        <Bone className="h-8 w-24 rounded-[9px]" />
      </div>
      <div className="mt-3 grid gap-[11px] sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="min-h-[118px] rounded-[10px] border border-border-soft bg-pure-white px-[14px] py-[13px]"
          >
            <Bone className="h-[30px] w-[30px] rounded-[9px]" />
            <Bone className="-mt-[26px] ml-[39px] h-4 w-20 rounded" />
            <Bone className="mt-[13px] h-8 w-16 rounded" />
            <Bone className="mt-2 h-[7px] w-full rounded-full" />
            <Bone className="mt-[5px] h-3 w-24 rounded" />
          </div>
        ))}
      </div>
    </Card>
  );
}

function ChartCardSkeleton({
  titleWidth,
  rightSlot,
  plot,
}: {
  titleWidth: string;
  rightSlot?: React.ReactNode;
  plot: React.ReactNode;
}) {
  return (
    <Card className="min-h-[208px] rounded-[var(--radius-card)] border-border shadow-[var(--shadow)]">
      <CardHeader className="mb-2 flex-row items-center justify-between space-y-0 px-[18px] pt-[15px] pb-0">
        <Bone className={cn("h-4 rounded", titleWidth)} />
        {rightSlot}
      </CardHeader>
      <CardContent className="px-[18px] pt-0 pb-3">{plot}</CardContent>
    </Card>
  );
}

function AttentionSkeleton() {
  return (
    <div
      className="flex min-h-[78px] flex-col gap-3 rounded-xl border border-[#ffe0d1] bg-[#fff0e8] px-[17px] py-[13px] sm:flex-row sm:items-center sm:gap-3.5"
      data-slot="attention-skeleton"
      aria-hidden
    >
      <Bone className="h-8 w-8 shrink-0 rounded-[9px] bg-pure-white" />
      <div className="min-w-0 flex-1 space-y-2">
        <Bone className="h-4 w-40 rounded bg-white/80" />
        <Bone className="h-3 w-64 max-w-full rounded bg-white/70" />
      </div>
      <Bone className="h-[38px] w-28 shrink-0 rounded-lg bg-pure-white" />
    </div>
  );
}

function LeadershipSkeleton() {
  return (
    <div
      className="flex min-h-[78px] flex-col gap-3 rounded-xl border border-[#e2ebfa] bg-[#f2f7ff] px-[17px] py-[13px] sm:flex-row sm:items-center sm:gap-3.5"
      data-slot="leadership-skeleton"
      aria-hidden
    >
      <Bone className="h-8 w-8 shrink-0 rounded-[9px] bg-white/90" />
      <div className="min-w-0 flex-1 space-y-2">
        <Bone className="h-4 w-44 rounded bg-white/80" />
        <Bone className="h-3 w-32 rounded bg-white/70" />
      </div>
      <Bone className="h-[38px] w-28 shrink-0 rounded-lg bg-pure-white" />
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div
      className="mb-[18px] flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"
      data-slot="overview-header-skeleton"
      aria-hidden
    >
      <div className="min-w-0 space-y-2">
        <Bone className="h-8 w-64 max-w-full rounded-md" />
        <Bone className="h-4 w-72 max-w-full rounded" />
      </div>
      <Bone className="h-[42px] w-[110px] shrink-0 rounded-[9px]" />
    </div>
  );
}

export function OverviewDashboardSkeleton({ className }: { className?: string }) {
  return (
    <div
      className={cn("space-y-[13px]", className)}
      data-slot="overview-dashboard-skeleton"
      role="status"
      aria-busy="true"
      aria-label="Loading overview dashboard"
    >
      <HeaderSkeleton />

      <div className="grid gap-3 lg:grid-cols-[minmax(0,2.15fr)_minmax(330px,0.9fr)]">
        <DeliveryConfidenceSkeleton />
        <KeyTakeawaysSkeleton />
      </div>

      <ScoreBreakdownSkeleton />

      <div className="grid gap-3 lg:grid-cols-[1fr_1fr_1.05fr]">
        <ChartCardSkeleton
          titleWidth="w-28"
          rightSlot={<Bone className="h-[33px] w-[128px] rounded-[9px]" />}
          plot={<AreaTrendPlotSkeleton />}
        />
        <ChartCardSkeleton
          titleWidth="w-32"
          rightSlot={
            <div className="flex items-center gap-2">
              <Bone className="h-2.5 w-16 rounded" />
              <Bone className="h-2.5 w-16 rounded" />
              <Bone className="h-3 w-14 rounded" />
            </div>
          }
          plot={<BurndownPlotSkeleton />}
        />
        <ChartCardSkeleton
          titleWidth="w-36"
          rightSlot={<Bone className="h-[33px] w-[128px] rounded-[9px]" />}
          plot={<HeatmapPlotSkeleton />}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-[1.9fr_1fr]">
        <AttentionSkeleton />
        <LeadershipSkeleton />
      </div>

      <span className="sr-only">Loading overview data…</span>
    </div>
  );
}
