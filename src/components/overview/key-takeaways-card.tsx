import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { cn } from "@/lib/utils";

const TONE_TILE: Record<
  OverviewDashboardModel["keyTakeaways"][number]["tone"],
  string
> = {
  danger: "bg-coral-soft text-[#ed6668]",
  warning: "bg-amber-soft text-[#e5a818]",
  info: "bg-green-soft text-[#249b6b]",
  success: "bg-green-soft text-[#249b6b]",
};

const FALLBACK_GLYPH: Record<
  OverviewDashboardModel["keyTakeaways"][number]["tone"],
  string
> = {
  danger: "↗",
  warning: "◷",
  info: "</>",
  success: "♢",
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
        "rounded-[var(--radius-card)] border-border shadow-[var(--shadow)]",
        className,
      )}
      data-slot="key-takeaways-card"
    >
      <CardHeader className="flex-row items-center space-y-0 border-b border-border px-5 pt-5 pb-[11px]">
        <CardTitle className="flex items-center text-[16px] font-semibold text-ink">
          <span className="mr-2 text-[18px] text-[#e9a825]" aria-hidden>
            ✦
          </span>
          Key takeaways
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0 px-5 pt-0 pb-2.5">
        {takeaways.map((item) => {
          const glyph = item.glyph ?? FALLBACK_GLYPH[item.tone] ?? "•";
          return (
            <Link
              key={item.id}
              href={item.href}
              className="group grid min-h-[59px] grid-cols-[34px_1fr_12px] items-center gap-2.5 border-b border-border-soft last:border-b-0"
            >
              <span
                className={cn(
                  "flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-[9px] text-[14px] font-semibold",
                  TONE_TILE[item.tone],
                )}
              >
                {glyph}
              </span>
              <div className="min-w-0">
                <p className="text-[13px] font-semibold text-ink">{item.title}</p>
                <p className="mt-0.5 text-[11px] leading-snug text-muted">{item.subtitle}</p>
              </div>
              <span className="justify-self-end text-[19px] leading-none text-[#687589]">
                ›
              </span>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}
