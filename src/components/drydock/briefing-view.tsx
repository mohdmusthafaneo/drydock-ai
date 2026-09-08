"use client";

import { useState } from "react";
import Link from "next/link";
import { HonestyBanner } from "@/components/drydock/honesty-banner";
import { TrustCount } from "@/components/drydock/trust-count";
import { FindingCard } from "@/components/drydock/finding-card";
import {
  formatAsOf,
  type MockBriefing,
} from "@/lib/drydock/types";

type Props = {
  briefing: MockBriefing;
  dataSource?: "db" | "mock";
};

type DemotedItem = {
  id: string;
  title: string;
  plainSentence: string;
  demoted: boolean;
  status: string;
  reasonCode: string | null;
  scopeSummary: string | null;
};

export function BriefingView({ briefing, dataSource = "mock" }: Props) {
  const [ruledIds, setRuledIds] = useState<string[]>([]);
  const [demotedOpen, setDemotedOpen] = useState(false);
  const [demotedItems, setDemotedItems] = useState<DemotedItem[] | null>(null);
  const [demotedLoading, setDemotedLoading] = useState(false);

  const remainingMinutes = briefing.findings
    .filter((f) => !ruledIds.includes(f.id))
    .reduce((sum, f) => sum + f.estimatedMinutes, 0);
  const openCount = briefing.findings.length - ruledIds.length;

  async function openDemoted() {
    setDemotedOpen(true);
    if (demotedItems || dataSource === "mock") return;
    setDemotedLoading(true);
    try {
      const res = await fetch("/api/drydock/suppressed", {
        credentials: "same-origin",
      });
      if (res.ok) {
        const json = (await res.json()) as { items: DemotedItem[] };
        setDemotedItems(json.items);
      }
    } finally {
      setDemotedLoading(false);
    }
  }

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
        <div className="rounded-[var(--radius-card)] border border-border bg-pure-white px-6 py-10 text-center shadow-[var(--shadow)]">
          <p className="font-display text-[26px] leading-tight tracking-[-0.23px] text-ink">
            Nothing needs you today.
          </p>
          <p className="mx-auto mt-3 max-w-lg text-[15px] leading-relaxed text-ash">
            {briefing.ledger.trustedCount.toLocaleString("en-US")} of{" "}
            {briefing.ledger.totalTests.toLocaleString("en-US")} still look trustworthy. Next
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
            Needs attention
          </p>
          <p className="mt-1 text-[14px] text-ash">
            About {remainingMinutes || briefing.queueMinutes} minutes. Looking at:{" "}
            {briefing.ledger.sinceLastReleaseLabel}.
          </p>
        </div>
        <Link
          href="/ledger"
          className="text-[14px] font-medium text-ink underline decoration-dove underline-offset-4 hover:decoration-ink"
        >
          See all tests
        </Link>
      </div>

      <div className="space-y-4">
        {briefing.findings.map((finding) => (
            <FindingCard
              key={finding.id}
              finding={finding}
              persist={dataSource === "db"}
              onRuled={(id) => setRuledIds((prev) => [...prev, id])}
            />
          ))}
      </div>

      <div className="rounded-[16px] border border-dashed border-dove/70 bg-fog/40">
        <button
          type="button"
          onClick={() => {
            if (demotedOpen) setDemotedOpen(false);
            else void openDemoted();
          }}
          className="w-full px-4 py-3 text-left text-[14px] text-ash hover:bg-fog/70"
        >
          {briefing.demotedSummary} — open in one click. Nothing was hidden without a reason.
        </button>
        {demotedOpen ? (
          <div className="border-t border-border px-4 py-3 text-[13px] leading-relaxed text-ash">
            {dataSource === "mock" ? (
              <p>
                Demo: items covered by earlier decisions appear here with the decision that
                covered them. Nothing disappears.
              </p>
            ) : demotedLoading ? (
              <p>Loading…</p>
            ) : demotedItems && demotedItems.length > 0 ? (
              <ul className="space-y-2">
                {demotedItems.map((item) => (
                  <li key={item.id} className="rounded-[12px] bg-pure-white/80 px-3 py-2">
                    <p className="font-medium text-ink">{item.title}</p>
                    <p className="mt-0.5">{item.plainSentence}</p>
                    {item.scopeSummary ? (
                      <p className="mt-1 text-[12px] text-graphite">
                        Applies to: {item.scopeSummary}
                        {item.reasonCode ? ` · ${item.reasonCode}` : ""}
                      </p>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p>No items covered by earlier decisions yet.</p>
            )}
          </div>
        ) : null}
      </div>

      <p className="text-[12px] text-graphite">
        {dataSource === "db"
          ? "Loaded from ingested CI results for this organization."
          : "Demo data — seed pilot data to bind this page to real CI results."}
      </p>
    </div>
  );
}
