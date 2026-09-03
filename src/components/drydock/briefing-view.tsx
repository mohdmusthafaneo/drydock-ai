"use client";

import { useState } from "react";
import Link from "next/link";
import { HonestyBanner } from "@/components/drydock/honesty-banner";
import { TrustCount } from "@/components/drydock/trust-count";
import { FindingCard } from "@/components/drydock/finding-card";
import {
  formatAsOf,
  type MockBriefing,
} from "@/lib/drydock/mock-data";

type Props = {
  briefing: MockBriefing;
};

export function BriefingView({ briefing }: Props) {
  const [ruledIds, setRuledIds] = useState<string[]>([]);
  const remainingMinutes = briefing.findings
    .filter((f) => !ruledIds.includes(f.id))
    .reduce((sum, f) => sum + f.estimatedMinutes, 0);
  const openCount = briefing.findings.length - ruledIds.length;

  if (briefing.silence || openCount === 0) {
    return (
      <div className="space-y-8">
        <HonestyBanner
          asOfLabel={formatAsOf(briefing.asOf)}
          repositoriesAnalyzed={briefing.ledger.repositoriesAnalyzed}
          runsAnalyzed={briefing.ledger.runsAnalyzed}
          blindSpots={briefing.ledger.blindSpots}
        />
        <TrustCount
          totalTests={briefing.ledger.totalTests}
          trustedCount={briefing.ledger.trustedCount}
          untrustedCount={briefing.ledger.untrustedCount}
        />
        <div className="rounded-[24px] border border-dove/50 bg-pure-white px-6 py-10 text-center shadow-[var(--shadow)]">
          <p className="font-display text-[26px] leading-tight tracking-[-0.23px] text-ink">
            Nothing needs you today.
          </p>
          <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-ash">
            {briefing.ledger.trustedCount.toLocaleString("en-US")} of{" "}
            {briefing.ledger.totalTests.toLocaleString("en-US")} holding. Next
            release checkpoint {briefing.nextReleaseLabel}.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <HonestyBanner
        asOfLabel={formatAsOf(briefing.asOf)}
        repositoriesAnalyzed={briefing.ledger.repositoriesAnalyzed}
        runsAnalyzed={briefing.ledger.runsAnalyzed}
        blindSpots={briefing.ledger.blindSpots}
      />

      <TrustCount
        totalTests={briefing.ledger.totalTests}
        trustedCount={briefing.ledger.trustedCount}
        untrustedCount={briefing.ledger.untrustedCount}
      />

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-display text-[22px] tracking-[-0.2px] text-ink">
            Today&apos;s queue
          </p>
          <p className="mt-1 text-[14px] text-ash">
            About {remainingMinutes || briefing.queueMinutes} minutes. Lens:{" "}
            {briefing.ledger.sinceLastReleaseLabel}.
          </p>
        </div>
        <Link
          href="/ledger"
          className="text-[14px] font-medium text-ink underline decoration-dove underline-offset-4 hover:decoration-ink"
        >
          Full Ledger
        </Link>
      </div>

      <div className="space-y-4">
        {briefing.findings.map((finding) => (
          <FindingCard
            key={finding.id}
            finding={finding}
            onRuled={(id) => setRuledIds((prev) => [...prev, id])}
          />
        ))}
      </div>

      <button
        type="button"
        className="w-full rounded-[16px] border border-dashed border-dove/70 bg-fog/40 px-4 py-3 text-left text-[14px] text-ash hover:border-dove hover:bg-fog/70"
      >
        {briefing.demotedSummary} — open in one click. Nothing was suppressed.
      </button>

      <p className="text-[12px] text-graphite">
        Mock data for UI confirmation. Rulings are recorded in-session only.
      </p>
    </div>
  );
}
