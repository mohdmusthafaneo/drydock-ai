"use client";

import { Badge } from "@/components/ui/badge";
import { RevealSection } from "@/components/motion/reveal-section";
import type {
  SuiteHealthSeverity,
  SuiteHealthSnapshot,
} from "@/lib/qa/suite-health";
import { cn } from "@/lib/utils";

const SEVERITY_BADGE: Record<SuiteHealthSeverity, "error" | "warning" | "muted"> = {
  high: "error",
  warning: "warning",
  medium: "muted",
};

const SEVERITY_LABEL: Record<SuiteHealthSeverity, string> = {
  high: "Serious",
  warning: "Watch",
  medium: "Note",
};

type Props = {
  snapshot: SuiteHealthSnapshot;
};

/**
 * Detail evidence under the decision strip: issues, files, and clean checks.
 */
export function SuiteHealthPanel({ snapshot }: Props) {
  return (
    <div className="space-y-[13px]">
      <RevealSection>
        <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-pure-white shadow-[var(--shadow)]">
          <header id="issues" className="scroll-mt-6 border-b border-border px-5 py-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h3 className="text-[16px] font-semibold tracking-[-0.2px] text-ink">
                What is weakening the suite
              </h3>
              <p className="text-[12px] text-muted">
                Top {snapshot.drivers.length} of {snapshot.totals.findings}
              </p>
            </div>
          </header>
          <ul className="divide-y divide-border-soft">
            {snapshot.drivers.map((driver, index) => (
              <li
                key={driver.id}
                className="grid gap-2 px-5 py-4 sm:grid-cols-[2.5rem_1fr] sm:items-start sm:gap-3"
              >
                <span className="hidden font-display text-[20px] tabular-nums text-faint sm:block">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-[14px] font-semibold text-ink">{driver.title}</p>
                    <Badge variant={SEVERITY_BADGE[driver.severity]}>
                      {SEVERITY_LABEL[driver.severity]}
                    </Badge>
                  </div>
                  <p className="mt-1 text-[13px] leading-snug text-secondary">{driver.summary}</p>
                  <p className="mt-2 text-[11px] leading-snug text-muted">{driver.evidence}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </RevealSection>

      <RevealSection>
        <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-pure-white shadow-[var(--shadow)]">
          <header id="files" className="scroll-mt-6 border-b border-border px-5 py-4">
            <h3 className="text-[16px] font-semibold tracking-[-0.2px] text-ink">
              Files to open first
            </h3>
          </header>
          <ul className="divide-y divide-border-soft">
            {snapshot.topFiles.map((file) => (
              <li
                key={file.id}
                className="flex flex-col gap-2 px-5 py-3.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={SEVERITY_BADGE[file.severity]}>
                      {SEVERITY_LABEL[file.severity]}
                    </Badge>
                    <code className="break-all text-[12px] font-medium text-ink sm:truncate">
                      {file.path}
                    </code>
                  </div>
                  <p className="mt-1.5 text-[13px] leading-snug text-secondary">{file.detail}</p>
                </div>
                <span
                  className={cn(
                    "shrink-0 text-[12px] font-semibold tabular-nums",
                    file.severity === "high" ? "text-coral" : "text-brown",
                  )}
                >
                  {file.metric}
                </span>
              </li>
            ))}
          </ul>
        </section>
      </RevealSection>

      <RevealSection>
        <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-pure-white shadow-[var(--shadow)]">
          <header id="start-here" className="scroll-mt-6 border-b border-border px-5 py-4">
            <h3 className="text-[16px] font-semibold tracking-[-0.2px] text-ink">
              Small fixes first
            </h3>
            <p className="mt-1 text-[13px] text-secondary">
              Cheap cleanup before rewriting the oversized files.
            </p>
          </header>
          <ol className="divide-y divide-border-soft">
            {snapshot.quickWins.map((win, index) => (
              <li key={win.id} className="flex gap-3 px-5 py-3.5">
                <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[8px] bg-accent-soft text-[12px] font-semibold text-brown">
                  {index + 1}
                </span>
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold text-ink">{win.title}</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-secondary">{win.detail}</p>
                </div>
              </li>
            ))}
          </ol>
          {snapshot.cleanSignals.length > 0 ? (
            <div className="border-t border-border bg-[#fbfbfa] px-5 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                Looking fine
              </p>
              <ul className="mt-2 space-y-1.5">
                {snapshot.cleanSignals.map((signal) => (
                  <li
                    key={signal}
                    className="flex items-start gap-2 text-[13px] text-secondary"
                  >
                    <span
                      className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-success"
                      aria-hidden
                    />
                    {signal}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      </RevealSection>
    </div>
  );
}
