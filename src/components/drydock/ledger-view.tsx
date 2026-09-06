"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { HonestyBanner } from "@/components/drydock/honesty-banner";
import { TrustCount } from "@/components/drydock/trust-count";
import {
  formatAsOf,
  type MockLedger,
  type MockTrustBucket,
  type TrustDeficitReason,
} from "@/lib/drydock/mock-data";
import { cn } from "@/lib/utils";

type Props = {
  ledger: MockLedger;
  dataSource?: "db" | "mock";
};

type SuppressedItem = {
  id: string;
  title: string;
  plainSentence: string;
  demoted: boolean;
  status: string;
  reasonCode: string | null;
  scopeSummary: string | null;
};

export function LedgerView({ ledger, dataSource = "mock" }: Props) {
  const [selected, setSelected] = useState<TrustDeficitReason | null>(null);
  const [suppressedOpen, setSuppressedOpen] = useState(false);
  const [suppressed, setSuppressed] = useState<SuppressedItem[] | null>(null);
  const [loadingSuppressed, setLoadingSuppressed] = useState(false);

  const bucket: MockTrustBucket | undefined = ledger.buckets.find(
    (b) => b.reason === selected,
  );

  async function openSuppressed() {
    const next = !suppressedOpen;
    setSuppressedOpen(next);
    if (!next || suppressed || dataSource === "mock") return;
    setLoadingSuppressed(true);
    try {
      const res = await fetch("/api/drydock/suppressed", {
        credentials: "same-origin",
      });
      if (res.ok) {
        const json = (await res.json()) as { items: SuppressedItem[] };
        setSuppressed(json.items);
      }
    } finally {
      setLoadingSuppressed(false);
    }
  }

  return (
    <div className="space-y-8">
      <HonestyBanner
        asOfLabel={formatAsOf(ledger.asOf)}
        repositoriesAnalyzed={ledger.repositoriesAnalyzed}
        runsAnalyzed={ledger.runsAnalyzed}
        blindSpots={ledger.blindSpots}
      />

      <TrustCount
        totalTests={ledger.totalTests}
        trustedCount={ledger.trustedCount}
        untrustedCount={ledger.untrustedCount}
        href="/ledger"
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-[14px] text-ash">
          Breakdown of the {ledger.untrustedCount.toLocaleString("en-US")}{" "}
          that aren&apos;t trustworthy. {ledger.sinceLastReleaseLabel}.
        </p>
        <Link
          href="/briefing"
          className="text-[14px] font-medium text-ink underline decoration-dove underline-offset-4 hover:decoration-ink"
        >
          Back to Today
        </Link>
      </div>

      <ul className="space-y-2">
        {ledger.buckets.map((item) => {
          const active = selected === item.reason;
          return (
            <li key={item.reason}>
              <button
                type="button"
                onClick={() =>
                  setSelected((prev) => (prev === item.reason ? null : item.reason))
                }
                className={cn(
                  "flex w-full items-start gap-4 rounded-[20px] border px-4 py-4 text-left transition-colors sm:px-5",
                  active
                    ? "border-ink/20 bg-pure-white shadow-[var(--shadow)]"
                    : "border-dove/50 bg-pure-white/80 hover:border-dove hover:bg-pure-white",
                )}
              >
                <span className="min-w-[3.5rem] font-display text-[28px] leading-none tracking-[-0.4px] text-ink">
                  {item.count}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[15px] font-medium text-ink">
                    {item.label}
                  </span>
                  <span className="mt-1 block text-[13px] leading-relaxed text-ash">
                    {item.plainSentence}
                  </span>
                </span>
                <ChevronRight
                  className={cn(
                    "mt-1 h-4 w-4 shrink-0 text-graphite transition-transform",
                    active && "rotate-90",
                  )}
                  strokeWidth={1.5}
                />
              </button>
            </li>
          );
        })}
      </ul>

      {bucket ? (
        <section className="space-y-3 rounded-[24px] border border-dove/50 bg-pure-white p-5 shadow-[var(--shadow)] sm:p-6">
          <h2 className="font-display text-[22px] tracking-[-0.2px] text-ink">
            {bucket.label} — sample evidence
          </h2>
          <p className="text-[13px] text-graphite">
            Two clicks from the count. Raw file paths and run history below.
          </p>
          <ul className="space-y-3">
            {bucket.tests.map((test) => (
              <li
                key={test.id}
                className="rounded-[16px] border border-dove/40 bg-fog/50 px-4 py-3"
              >
                <p className="text-[15px] font-medium text-ink">{test.name}</p>
                <p className="mt-1 text-[13px] text-graphite">
                  {test.repository} · {test.suitePath}
                </p>
                <p className="mt-1 font-mono text-[12px] text-ink">{test.filePath}</p>
                <p className="mt-2 text-[13px] leading-relaxed text-ash">
                  {test.evidenceSummary}
                </p>
                <p className="mt-2 text-[12px] text-graphite">
                  {test.executionCount} executions · {test.failCount} fails ·{" "}
                  {test.retryPassCount} retry-passes · last {test.lastOutcome}
                </p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="rounded-[16px] border border-dove/50 bg-fog/50">
        <button
          type="button"
          onClick={() => void openSuppressed()}
          className="flex w-full items-center justify-between px-4 py-3 text-left text-[14px] font-medium text-ink"
        >
          Hidden by earlier decisions
          <span className="text-[12px] font-normal text-graphite">
            {suppressedOpen ? "Hide" : "One click away"}
          </span>
        </button>
        {suppressedOpen ? (
          <div className="border-t border-dove/40 px-4 py-3 text-[13px] leading-relaxed text-ash">
            {dataSource === "mock" ? (
              <p>
                Demo: when you hide an issue with a decision, it appears here with the reason
                and the decision that hid it.
              </p>
            ) : loadingSuppressed ? (
              <p>Loading…</p>
            ) : suppressed && suppressed.length > 0 ? (
              <ul className="space-y-2">
                {suppressed.map((item) => (
                  <li key={item.id} className="rounded-[12px] bg-pure-white/80 px-3 py-2">
                    <p className="font-medium text-ink">{item.title}</p>
                    <p className="mt-0.5">{item.plainSentence}</p>
                    <p className="mt-1 text-[12px] text-graphite">
                      {item.demoted ? "Covered by earlier decision" : item.status}
                      {item.scopeSummary ? ` · ${item.scopeSummary}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            ) : (
              <p>Nothing hidden. No issues were set aside.</p>
            )}
          </div>
        ) : null}
      </div>

      <p className="text-[12px] text-graphite">
        {dataSource === "db"
          ? "Counts bound to ingested CI results for this organization."
          : "Demo data for UI confirmation. Seed pilot to bind counts."}
      </p>
    </div>
  );
}
