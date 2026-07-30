import Link from "next/link";
import { cn } from "@/lib/utils";
import type { IntegrationHealthAggregate } from "@/lib/integration-health";

const PROVIDER_LABELS: Record<string, string> = {
  GITHUB: "GitHub",
  JIRA: "Jira",
  JENKINS: "Jenkins",
  GRAFANA: "Grafana",
  PROMETHEUS: "Prometheus",
  SLACK: "Slack",
  AWS: "AWS",
};

const VERDICT_BADGE = {
  good: "border-dove/50 bg-fog text-ash",
  attention: "border-apricot/40 bg-apricot-wash/60 text-rust",
  risk: "border-rust/25 bg-rust/8 text-rust",
} as const;

type Props = {
  summary: IntegrationHealthAggregate;
};

export function IntegrationHealthSummaryStrip({ summary }: Props) {
  if (summary.total === 0) return null;

  const verdictLabel =
    summary.verdict === "good"
      ? "All healthy"
      : summary.verdict === "risk"
        ? "Action needed"
        : "Needs attention";

  const unhealthyLabel = summary.firstUnhealthyProvider
    ? PROVIDER_LABELS[summary.firstUnhealthyProvider] ?? summary.firstUnhealthyProvider
    : null;

  return (
    <section className="rounded-[24px] border border-border-subtle bg-pure-white px-6 py-5 shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <span
            className={cn(
              "inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none",
              VERDICT_BADGE[summary.verdict],
            )}
          >
            {verdictLabel}
          </span>
          <h2 className="mt-3 font-display text-[22px] leading-[1.2] tracking-[-0.2px] text-ink">
            {summary.headline}
          </h2>
          {unhealthyLabel && summary.verdict !== "good" && (
            <p className="mt-1.5 text-[14px] text-ash">
              First issue: {unhealthyLabel}
              {summary.degraded > 0 && ` · ${summary.degraded} degraded`}
              {summary.disconnected > 0 && ` · ${summary.disconnected} disconnected`}
            </p>
          )}
        </div>
        <div className="flex gap-6 text-center">
          <div>
            <p className="font-display text-[28px] leading-none tabular-nums text-ink">
              {summary.healthy}
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.06em] text-graphite">Healthy</p>
          </div>
          <div>
            <p className="font-display text-[28px] leading-none tabular-nums text-rust">
              {summary.total - summary.healthy}
            </p>
            <p className="mt-1 text-[11px] uppercase tracking-[0.06em] text-graphite">Issues</p>
          </div>
        </div>
      </div>
      {summary.firstUnhealthyProvider && summary.verdict !== "good" && (
        <p className="mt-4 text-[13px] text-graphite">
          Scroll to{" "}
          <Link href="#integration-grid" className="font-medium text-ink underline-offset-4 hover:underline">
            {unhealthyLabel}
          </Link>{" "}
          to resolve.
        </p>
      )}
    </section>
  );
}
