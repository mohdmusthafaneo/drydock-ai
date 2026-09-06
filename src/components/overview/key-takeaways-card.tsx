import Link from "next/link";
import {
  AlertTriangle,
  Ban,
  ChevronRight,
  Lightbulb,
  Scale,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

const TONE_TILE: Record<
  OverviewDashboardModel["keyTakeaways"][number]["tone"],
  { bg: string; icon: LucideIcon }
> = {
  danger: { bg: "bg-error-soft text-error", icon: Ban },
  warning: { bg: "bg-accent-soft text-accent", icon: AlertTriangle },
  info: { bg: "bg-info-soft text-info", icon: Scale },
  success: { bg: "bg-success-soft text-success", icon: Sparkles },
};

export function KeyTakeawaysCard({
  takeaways,
  className,
}: {
  takeaways: OverviewDashboardModel["keyTakeaways"];
  className?: string;
}) {
  return (
    <Card
      className={cn(
        "rounded-[12px] border-border shadow-[0_1px_2px_rgba(16,24,40,0.04)]",
        className,
      )}
      data-slot="key-takeaways-card"
    >
      <CardHeader className="flex-row items-center gap-2 space-y-0 p-5 pb-2">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-warning-soft text-warning">
          <Lightbulb className="h-3.5 w-3.5" strokeWidth={1.75} />
        </span>
        <CardTitle className="text-[15px] font-semibold text-ink">Key takeaways</CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5 p-5 pt-2">
        {takeaways.map((item) => {
          const tile = TONE_TILE[item.tone];
          const Icon = tile.icon;
          return (
            <Link
              key={item.id}
              href={item.href}
              className="group flex items-start gap-3 rounded-lg px-1 py-2.5 hover:bg-hover"
            >
              <span
                className={cn(
                  "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                  tile.bg,
                )}
              >
                <Icon className="h-4 w-4" strokeWidth={1.5} />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-ink">{item.title}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.subtitle}</p>
              </div>
              <ChevronRight
                className="mt-1 h-4 w-4 shrink-0 text-faint"
                strokeWidth={1.5}
              />
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
