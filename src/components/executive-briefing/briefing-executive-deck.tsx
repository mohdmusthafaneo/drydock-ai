"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { ExecutiveBriefing } from "@/lib/executive-briefing/types";
import type { ExecutiveDeck } from "@/lib/executive-briefing/compose-executive-deck";
import type { JiraConnectionState } from "@/lib/executive-briefing/health-score";
import { dimensionBandLabel } from "@/lib/executive-briefing/compose-executive-deck";
import {
  buildDisplayHealthDimensions,
  isScoredDimension,
} from "@/lib/executive-briefing/health-dimensions-display";
import { DeliveryHealthGauge } from "@/components/executive-briefing/delivery-health-gauge";
import { AnimatedNumber } from "@/components/motion/animated-number";
import { AnimatedScoreBar } from "@/components/motion/animated-score-bar";
import { HoverLift } from "@/components/motion/hover-lift";
import { RevealItem } from "@/components/motion/reveal-item";
import { RevealSection } from "@/components/motion/reveal-section";
import { cn } from "@/lib/utils";

type Props = {
  briefing: ExecutiveBriefing;
  deck: ExecutiveDeck;
  orgName: string;
  jiraConnection?: JiraConnectionState;
};

const TONE_STYLES = {
  good: "border-border/50 bg-fog text-ash",
  attention: "border-apricot/40 bg-apricot-wash/60 text-rust",
  risk: "border-rust/25 bg-rust/8 text-rust",
  neutral: "border-border/50 bg-fog text-graphite",
} as const;

const SCORE_BAR: Record<string, string> = {
  strong: "bg-rust",
  steady: "bg-[#8b5a3c]",
  caution: "bg-[#c49a7a]",
  at_risk: "bg-[#3d1f14]",
};

function scoreBarClass(score: number): string {
  if (score >= 80) return SCORE_BAR.strong;
  if (score >= 60) return SCORE_BAR.steady;
  if (score >= 40) return SCORE_BAR.caution;
  return SCORE_BAR.at_risk;
}

export function BriefingExecutiveDeck({ briefing, deck, orgName, jiraConnection }: Props) {
  const { health } = briefing;
  const displayDimensions = buildDisplayHealthDimensions(health.dimensions, jiraConnection);
  const hasPortfolio = deck.portfolio.length > 0;
  const hasBlindSpots = deck.blindSpots.length > 0;

  return (
    <section id="leadership" className="scroll-mt-24 space-y-12 py-16">
      <RevealSection className="space-y-12">
        <RevealItem transition={{ duration: 0.55 }}>
          <div>
            <h2 className="text-[28px] font-bold leading-[1.12] tracking-[-0.75px] text-ink">
              Delivery confidence
            </h2>
            <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ash">
              How {orgName} scores across release readiness, production stability, engineering
              risk, team momentum, and governance — so you know where to focus without reading a
              backlog.
            </p>
          </div>
        </RevealItem>

        <div className="grid gap-5 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:items-start">
          <RevealItem>
            <DeliveryHealthGauge
              score={health.overall}
              band={health.band}
              bandLabel={health.bandLabel}
              visible={health.visible}
            />
          </RevealItem>

          {health.visible ? (
            <div className="grid gap-4 sm:grid-cols-2">
              {displayDimensions.map((dim) =>
                isScoredDimension(dim) ? (
                  <RevealItem key={dim.id}>
                    <HoverLift className="h-full">
                      <article className="flex h-full flex-col rounded-[var(--radius-card)] border border-border bg-pure-white p-5 shadow-[var(--shadow)]">
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-display text-[16px] leading-snug tracking-[-0.12px] text-ink">
                            {dim.label}
                          </h3>
                          <span className="shrink-0 text-[13px] font-medium text-graphite">
                            {dimensionBandLabel(dim.score)}
                          </span>
                        </div>
                        <div className="mt-3 flex items-center gap-3">
                          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-metric-track">
                            <AnimatedScoreBar
                              score={dim.score}
                              className={scoreBarClass(dim.score)}
                            />
                          </div>
                          <AnimatedNumber
                            value={dim.score}
                            delay={0.5}
                            className="shrink-0 font-display text-[22px] leading-none tabular-nums text-ink"
                          />
                        </div>
                        <p className="mt-3 flex-1 text-[14px] leading-relaxed text-ash">
                          {dim.summary}
                        </p>
                      </article>
                    </HoverLift>
                  </RevealItem>
                ) : (
                  <RevealItem key={dim.id}>
                    <HoverLift className="h-full">
                      <Link
                        href={dim.href}
                        className="group flex h-full flex-col rounded-[var(--radius-card)] border border-dashed border-border bg-fog p-5 transition-colors hover:border-graphite/40 hover:bg-fog/80"
                      >
                        <div className="flex items-start justify-between gap-3">
                          <h3 className="font-display text-[16px] leading-snug tracking-[-0.12px] text-ink">
                            {dim.label}
                          </h3>
                          <span className="shrink-0 text-[13px] font-medium text-graphite">
                            Not scored
                          </span>
                        </div>
                        <div className="mt-3 h-1.5 rounded-full bg-metric-track" />
                        <p className="mt-3 flex-1 text-[14px] leading-relaxed text-ash">
                          {dim.summary}
                        </p>
                        <span className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-ink group-hover:text-rust">
                          {dim.actionLabel ?? "Set up"}
                          <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                        </span>
                      </Link>
                    </HoverLift>
                  </RevealItem>
                ),
              )}
            </div>
          ) : (
            <RevealItem>
              <div className="flex items-center rounded-[var(--radius-card)] border border-dashed border-border bg-fog px-6 py-8">
                <p className="text-[14px] leading-relaxed text-graphite">
                  Connect Jira, GitHub, and observability to see how each dimension contributes to
                  your delivery confidence score.
                </p>
              </div>
            </RevealItem>
          )}
        </div>
      </RevealSection>

      <RevealSection className="space-y-5">
        <RevealItem>
          <div>
            <h3 className="font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
              Waiting on leadership
            </h3>
            <p className="mt-1 text-[14px] text-graphite">
              Items that need an executive decision or awareness before the organization ships.
            </p>
          </div>
        </RevealItem>

        {deck.decisions.length > 0 ? (
          <ul className="space-y-3">
            {deck.decisions.map((item) => (
              <li key={item.id}>
                <RevealItem>
                  <HoverLift>
                    <Link
                      href={item.href}
                      className={cn(
                        "group flex flex-col gap-2 rounded-[var(--radius-card)] border px-5 py-4 shadow-[var(--shadow)] transition-shadow sm:flex-row sm:items-center sm:justify-between",
                        item.urgency === "critical"
                          ? "border-rust/20 bg-apricot-wash"
                          : "border-border-subtle bg-pure-white",
                      )}
                    >
                      <div className="min-w-0">
                        <p className="font-display text-[17px] leading-snug tracking-[-0.14px] text-ink">
                          {item.title}
                        </p>
                        <p className="mt-1 text-[14px] leading-relaxed text-ash">{item.context}</p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 text-[15px] font-medium text-ink group-hover:text-rust">
                        {item.actionLabel}
                        <ArrowRight
                          className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5"
                          strokeWidth={1.5}
                        />
                      </span>
                    </Link>
                  </HoverLift>
                </RevealItem>
              </li>
            ))}
          </ul>
        ) : (
          <RevealItem>
            <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-border bg-pure-white px-5 py-4 shadow-[var(--shadow)]">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-chart-blue" strokeWidth={1.5} />
              <div>
                <p className="font-display text-[17px] leading-snug text-ink">
                  No leadership actions right now
                </p>
                <p className="mt-1 text-[14px] leading-relaxed text-ash">
                  Releases can proceed without your sign-off, production is stable, and briefing data
                  is current.
                </p>
              </div>
            </div>
          </RevealItem>
        )}
      </RevealSection>

      {hasPortfolio && (
        <RevealSection className="space-y-5">
          <RevealItem>
            <div>
              <h3 className="font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
                Release portfolio
              </h3>
              <p className="mt-1 text-[14px] text-graphite">
                What is in flight and what is already live — not ticket counts.
              </p>
            </div>
          </RevealItem>
          <ul className="divide-y divide-border rounded-[var(--radius-card)] border border-border bg-pure-white shadow-[var(--shadow)]">
            {deck.portfolio.map((release) => (
              <li key={release.id}>
                <RevealItem>
                  <Link
                    href={release.href}
                    className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-4 transition-colors hover:bg-fog/60"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-display text-[17px] leading-snug tracking-[-0.14px] text-ink group-hover:text-rust">
                        {release.name}
                      </p>
                      <p className="mt-0.5 text-[14px] text-ash">{release.phase}</p>
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center rounded-[8px] border px-2.5 py-1 text-[11px] font-medium leading-none",
                        TONE_STYLES[release.tone],
                      )}
                    >
                      {release.tone === "good"
                        ? "On track"
                        : release.tone === "risk"
                          ? "At risk"
                          : release.tone === "attention"
                            ? "Needs review"
                            : "In flight"}
                    </span>
                    {release.readiness != null && (
                      <span className="shrink-0 text-right">
                        <AnimatedNumber
                          value={Math.round(release.readiness)}
                          suffix="%"
                          delay={0.2}
                          className="font-display text-[22px] leading-none tabular-nums text-ink"
                        />
                        <span className="mt-0.5 block text-[11px] text-graphite">ready</span>
                      </span>
                    )}
                    <ArrowRight
                      className="h-4 w-4 shrink-0 text-dove transition-transform group-hover:translate-x-0.5 group-hover:text-rust"
                      strokeWidth={1.5}
                    />
                  </Link>
                </RevealItem>
              </li>
            ))}
          </ul>
        </RevealSection>
      )}

      {hasBlindSpots && (
        <RevealSection className="space-y-4">
          <RevealItem>
            <div>
              <h3 className="font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
                What we cannot see yet
              </h3>
              <p className="mt-1 text-[14px] text-graphite">
                Gaps in connected data — the score above may be incomplete until these are resolved.
              </p>
            </div>
          </RevealItem>
          <ul className="space-y-2 rounded-[var(--radius-card)] border border-dashed border-border bg-fog px-5 py-4">
            {deck.blindSpots.map((spot) => (
              <li key={spot}>
                <RevealItem>
                  <div className="flex items-start gap-2 text-[14px] text-ash">
                    <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-graphite" />
                    {spot}
                  </div>
                </RevealItem>
              </li>
            ))}
          </ul>
          <RevealItem>
            <Link
              href="/integrations"
              className="inline-flex items-center gap-1 text-[15px] font-medium text-ink hover:text-rust"
            >
              Manage integrations
              <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
            </Link>
          </RevealItem>
        </RevealSection>
      )}

      {deck.teamLinks.length > 0 && (
        <RevealSection className="space-y-5 border-t border-border-subtle pt-12">
          <RevealItem>
            <div>
              <h3 className="font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
                Delegate the detail
              </h3>
              <p className="mt-1 max-w-xl text-[14px] text-graphite">
                Your team owns the operational depth — these links are for them, not for you to
                monitor daily.
              </p>
            </div>
          </RevealItem>
          <div className="grid gap-4 sm:grid-cols-2">
            {deck.teamLinks.map((link) => (
              <RevealItem key={link.id}>
                <HoverLift className="h-full">
                  <Link
                    href={link.href}
                    className="group block h-full rounded-[var(--radius-card)] border border-border bg-pure-white p-5 shadow-[var(--shadow)] transition-shadow hover:shadow-[0_0_0_1px_rgba(163,166,175,0.3),rgba(0,0,0,0.08)_0px_24px_30px_-8px]"
                  >
                    <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-graphite">
                      For your {link.audience.toLowerCase()}
                    </p>
                    <p className="mt-2 font-display text-[17px] leading-snug text-ink group-hover:text-rust">
                      {link.title}
                    </p>
                    <p className="mt-1 text-[14px] leading-relaxed text-ash">{link.summary}</p>
                  </Link>
                </HoverLift>
              </RevealItem>
            ))}
          </div>
        </RevealSection>
      )}
    </section>
  );
}
