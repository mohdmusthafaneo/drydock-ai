"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { OverviewLink } from "@/components/overview/overview-link";
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
        "rounded-[var(--radius-card)] border-border px-5 pt-5 pb-2.5 shadow-[var(--shadow)]",
        className,
      )}
      data-slot="key-takeaways-card"
    >
      <div className="flex items-center border-b border-border pb-[11px]">
        <CardTitle className="flex items-center text-[16px] font-semibold tracking-[-0.2px] text-ink">
          <span className="mr-2 text-[18px] text-[#e9a825]" aria-hidden>
            ✦
          </span>
          Key takeaways
        </CardTitle>
      </div>
      {takeaways.map((item) => {
        const glyph = item.glyph ?? FALLBACK_GLYPH[item.tone] ?? "•";
        return (
          <OverviewLink
            key={item.id}
            href={item.href}
            className="group grid min-h-[59px] grid-cols-[34px_1fr_12px] items-center gap-2.5 border-b border-border-soft last:border-b-0"
          >
            <span
              className={cn(
                "flex h-[31px] w-[31px] shrink-0 items-center justify-center rounded-[9px] text-[14px] font-bold",
                TONE_TILE[item.tone],
              )}
            >
              {glyph}
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-semibold text-ink">{item.title}</p>
              <p className="mt-0.5 text-[11px] text-muted">{item.subtitle}</p>
            </div>
            <span className="justify-self-end text-[19px] leading-none text-[#687589]">
              ›
            </span>
          </OverviewLink>
        );
      })}
    </Card>
  );
}
