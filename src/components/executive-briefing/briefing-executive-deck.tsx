import Link from "next/link";
import { ArrowRight, CheckCircle2 } from "lucide-react";
import type { ExecutiveBriefing } from "@/lib/executive-briefing/types";
import type { ExecutiveDeck } from "@/lib/executive-briefing/compose-executive-deck";
import { dimensionBandLabel } from "@/lib/executive-briefing/compose-executive-deck";
import {
  buildDisplayHealthDimensions,
  isScoredDimension,
} from "@/lib/executive-briefing/health-dimensions-display";
import { DeliveryHealthGauge } from "@/components/executive-briefing/delivery-health-gauge";
import { cn } from "@/lib/utils";

type Props = {
  briefing: ExecutiveBriefing;
  deck: ExecutiveDeck;
  orgName: string;
};

const TONE_STYLES = {
  good: "border-dove/50 bg-fog text-ash",
  attention: "border-apricot/40 bg-apricot-wash/60 text-rust",
  risk: "border-rust/25 bg-rust/8 text-rust",
  neutral: "border-dove/50 bg-fog text-graphite",
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

export function BriefingExecutiveDeck({ briefing, deck, orgName }: Props) {
  const { health } = briefing;
  const displayDimensions = buildDisplayHealthDimensions(health.dimensions);
  const hasPortfolio = deck.portfolio.length > 0;
  const hasBlindSpots = deck.blindSpots.length > 0;

  return (
    <section id="leadership" className="scroll-mt-24 space-y-12 py-16">
      <div>
        <h2 className="font-display text-[44px] leading-[1.1] tracking-[-0.66px] text-ink">
          Delivery confidence
        </h2>
        <p className="mt-3 max-w-2xl text-[16px] leading-relaxed text-ash">
          How {orgName} scores across release readiness, production stability, team momentum, and
          governance — so you know where to focus without reading a backlog.
        </p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] lg:items-start">
        <DeliveryHealthGauge
          score={health.overall}
          band={health.band}
          bandLabel={health.bandLabel}
          visible={health.visible}
        />

        {health.visible ? (
          <div className="grid gap-4 sm:grid-cols-2">
            {displayDimensions.map((dim) =>
              isScoredDimension(dim) ? (
                <article
                  key={dim.id}
                  className="flex flex-col rounded-[24px] border border-border-subtle bg-pure-white p-5 shadow-[var(--shadow)]"
                >
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
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          scoreBarClass(dim.score),
                        )}
                        style={{ width: `${dim.score}%` }}
                      />
                    </div>
                    <span className="shrink-0 font-display text-[22px] leading-none tabular-nums text-ink">
                      {dim.score}
                    </span>
                  </div>
                  <p className="mt-3 flex-1 text-[14px] leading-relaxed text-ash">{dim.summary}</p>
                </article>
              ) : (
                <Link
                  key={dim.id}
                  href={dim.href}
                  className="group flex flex-col rounded-[24px] border border-dashed border-dove bg-fog p-5 transition-colors hover:border-graphite/40 hover:bg-fog/80"
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="font-display text-[16px] leading-snug tracking-[-0.12px] text-ink">
                      {dim.label}
                    </h3>
                    <span className="shrink-0 text-[13px] font-medium text-graphite">Not scored</span>
                  </div>
                  <div className="mt-3 h-1.5 rounded-full bg-metric-track" />
                  <p className="mt-3 flex-1 text-[14px] leading-relaxed text-ash">{dim.summary}</p>
                  <span className="mt-4 inline-flex items-center gap-1 text-[14px] font-medium text-ink group-hover:text-rust">
                    Set up
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </span>
                </Link>
              ),
            )}
          </div>
        ) : (
          <div className="flex items-center rounded-[24px] border border-dashed border-dove bg-fog px-6 py-8">
            <p className="text-[14px] leading-relaxed text-graphite">
              Connect Jira, GitHub, and observability to see how each dimension contributes to your
              delivery confidence score.
            </p>
          </div>
        )}
      </div>

      <div className="space-y-5">
        <div>
          <h3 className="font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
            Waiting on leadership
          </h3>
          <p className="mt-1 text-[14px] text-graphite">
            Items that need an executive decision or awareness before the organization ships.
          </p>
        </div>

        {deck.decisions.length > 0 ? (
          <ul className="space-y-3">
            {deck.decisions.map((item) => (
              <li key={item.id}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex flex-col gap-2 rounded-[24px] border px-5 py-4 shadow-[var(--shadow)] transition-shadow sm:flex-row sm:items-center sm:justify-between",
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
                    <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="flex items-start gap-3 rounded-[24px] border border-border-subtle bg-pure-white px-5 py-4 shadow-[var(--shadow)]">
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
        )}
      </div>

      {hasPortfolio && (
        <div className="space-y-5">
          <div>
            <h3 className="font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
              Release portfolio
            </h3>
            <p className="mt-1 text-[14px] text-graphite">
              What is in flight and what is already live — not ticket counts.
            </p>
          </div>
          <ul className="divide-y divide-border-subtle rounded-[24px] border border-border-subtle bg-pure-white shadow-[var(--shadow)]">
            {deck.portfolio.map((release) => (
              <li key={release.id}>
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
                      "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
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
                      <span className="font-display text-[22px] leading-none tabular-nums text-ink">
                        {Math.round(release.readiness)}%
                      </span>
                      <span className="mt-0.5 block text-[11px] text-graphite">ready</span>
                    </span>
                  )}
                  <ArrowRight
                    className="h-4 w-4 shrink-0 text-dove group-hover:text-rust"
                    strokeWidth={1.5}
                  />
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {hasBlindSpots && (
        <div className="space-y-4">
          <div>
            <h3 className="font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
              What we cannot see yet
            </h3>
            <p className="mt-1 text-[14px] text-graphite">
              Gaps in connected data — the score above may be incomplete until these are resolved.
            </p>
          </div>
          <ul className="space-y-2 rounded-[24px] border border-dashed border-dove bg-fog px-5 py-4">
            {deck.blindSpots.map((spot) => (
              <li key={spot} className="flex items-start gap-2 text-[14px] text-ash">
                <span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-graphite" />
                {spot}
              </li>
            ))}
          </ul>
          <Link
            href="/integrations"
            className="inline-flex items-center gap-1 text-[15px] font-medium text-ink hover:text-rust"
          >
            Manage integrations
            <ArrowRight className="h-3.5 w-3.5" strokeWidth={1.5} />
          </Link>
        </div>
      )}

      {deck.teamLinks.length > 0 && (
        <div className="space-y-5 border-t border-border-subtle pt-12">
          <div>
            <h3 className="font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
              Delegate the detail
            </h3>
            <p className="mt-1 max-w-xl text-[14px] text-graphite">
              Your team owns the operational depth — these links are for them, not for you to
              monitor daily.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {deck.teamLinks.map((link) => (
              <Link
                key={link.id}
                href={link.href}
                className="group rounded-[24px] border border-border-subtle bg-pure-white p-5 shadow-[var(--shadow)] transition-shadow hover:shadow-[0_0_0_1px_rgba(163,166,175,0.3),rgba(0,0,0,0.08)_0px_24px_30px_-8px]"
              >
                <p className="text-[11px] font-medium uppercase tracking-[0.04em] text-graphite">
                  For your {link.audience.toLowerCase()}
                </p>
                <p className="mt-2 font-display text-[17px] leading-snug text-ink group-hover:text-rust">
                  {link.title}
                </p>
                <p className="mt-1 text-[14px] leading-relaxed text-ash">{link.summary}</p>
              </Link>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
