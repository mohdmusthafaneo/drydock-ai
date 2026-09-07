"use client";

import { Card, CardTitle } from "@/components/ui/card";
import { InfoTip } from "@/components/ui/info-tip";
import { Progress } from "@/components/ui/progress";
import { OverviewLink } from "@/components/overview/overview-link";
import type { OverviewDashboardModel } from "@/lib/overview/types";
import { PILLAR_HREFS } from "@/lib/overview/nav-context";
import { cn } from "@/lib/utils";

function DeltaChip({ delta }: { delta: number | null }) {
  if (delta === null) {
    return (
      <em className="ml-1.5 inline-block rounded-[5px] bg-elevated px-[5px] py-[3px] text-[10px] leading-none not-italic text-muted align-[3px]">
        —
      </em>
    );
  }
  const up = delta > 0;
  const flat = delta === 0;
  return (
    <em
      className={cn(
        "ml-1.5 inline-block rounded-[5px] px-[5px] py-[3px] text-[10px] leading-none not-italic align-[3px]",
        flat
          ? "bg-elevated text-muted"
          : up
            ? "bg-green-soft text-[#159766]"
            : "bg-coral-soft text-[#f15f5f]",
      )}
    >
      {up ? "↑" : flat ? "" : "↓"} {Math.abs(delta)}%
    </em>
  );
}

const PILLAR_META: Record<string, { tone: string; glyph: string; suffix?: string }> = {
  delivery: { tone: "bg-accent-soft text-accent", glyph: "⚑", suffix: "%" },
  code: { tone: "bg-blue-soft text-[#2d76df]", glyph: "</>" },
  qa: { tone: "bg-purple-soft text-purple", glyph: "⚗" },
  compliance: { tone: "bg-green-soft text-[#299c6b]", glyph: "♢" },
};

export function ScoreBreakdownCard({
  pillars,
  className,
}: {
  pillars: OverviewDashboardModel["pillars"];
  className?: string;
}) {
  const primaryHref = pillars[0]?.href ?? PILLAR_HREFS.delivery ?? "/delivery-analysis";

  return (
    <Card
      className={cn(
        "rounded-[var(--radius-card)] border-border px-[18px] pt-4 pb-2.5 shadow-[var(--shadow)]",
        className,
      )}
      data-slot="score-breakdown-card"
    >
      <div className="flex items-center justify-between">
        <div className="flex items-baseline gap-2.5">
          <div className="flex items-center gap-1.5">
            <CardTitle className="text-[16px] font-semibold tracking-[-0.2px] text-ink">
              Score breakdown
            </CardTitle>
            <InfoTip
              definition="The four pillars of engineering productivity. Deltas are week-over-week when snapshots exist."
              evidenceSource="Delivery, code, QA, and compliance signals"
            />
          </div>
          <p className="text-[11px] text-muted">The 4 pillars of engineering productivity</p>
        </div>
        <OverviewLink
          href={primaryHref}
          className="rounded-[9px] border border-border bg-pure-white px-[11px] py-[7px] text-[11px] font-medium text-secondary hover:bg-hover"
        >
          View details
        </OverviewLink>
      </div>
      <div className="mt-3 grid gap-[11px] sm:grid-cols-2 xl:grid-cols-4">
        {pillars.map((pillar) => {
          const meta = PILLAR_META[pillar.id] ?? {
            tone: "bg-accent-soft text-accent",
            glyph: "•",
          };
          const href = pillar.href ?? PILLAR_HREFS[pillar.id] ?? "/delivery-analysis";
          return (
            <OverviewLink
              key={pillar.id}
              href={href}
              className="relative min-h-[118px] rounded-[10px] border border-border-soft bg-pure-white px-[14px] py-[13px] transition-colors hover:border-border hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent"
            >
              <span
                className={cn(
                  "flex h-[30px] w-[30px] items-center justify-center rounded-[9px] text-[15px] font-bold",
                  meta.tone,
                )}
              >
                {pillar.glyph ?? meta.glyph}
              </span>
              <strong className="-mt-[26px] ml-[39px] block text-[14px] leading-[19px] font-bold text-ink">
                {pillar.name}
              </strong>
              <p className="mt-[13px] text-[24px] leading-[32px] font-semibold tracking-[-0.7px] text-ink">
                {pillar.score}
                {meta.suffix ?? ""}
                <DeltaChip delta={pillar.delta} />
              </p>
              <Progress
                value={pillar.progress}
                className="mt-2 h-[7px]"
                indicatorClassName="bg-accent"
              />
              <small className="mt-[5px] block text-[11px] leading-[15px] text-muted">{pillar.footnote}</small>
            </OverviewLink>
          );
        })}
      </div>
    </Card>
  );
}
