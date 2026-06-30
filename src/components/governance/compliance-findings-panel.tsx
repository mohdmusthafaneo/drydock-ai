"use client";

import Link from "next/link";
import { AlertTriangle, CheckCircle2, ExternalLink } from "lucide-react";
import type { ComplianceFindingView } from "@/lib/compliance/types";
import { cn } from "@/lib/utils";

const SEVERITY_ORDER = ["critical", "warning", "info"] as const;

const SEVERITY_STYLES = {
  critical: "border-rust/30 bg-rust/8 text-rust",
  warning: "border-apricot/40 bg-apricot-wash/60 text-rust",
  info: "border-dove/50 bg-fog text-ash",
} as const;

function severityLabel(severity: ComplianceFindingView["severity"]): string {
  switch (severity) {
    case "critical":
      return "Critical";
    case "warning":
      return "Warning";
    default:
      return "Info";
  }
}

function groupFindings(findings: ComplianceFindingView[]) {
  const groups: Record<string, ComplianceFindingView[]> = {
    critical: [],
    warning: [],
    info: [],
  };

  for (const finding of findings) {
    groups[finding.severity].push(finding);
  }

  return SEVERITY_ORDER.map((severity) => ({
    severity,
    findings: groups[severity],
  })).filter((group) => group.findings.length > 0);
}

export function ComplianceFindingsPanel({
  findings,
  openCount,
  criticalOpen,
}: {
  findings: ComplianceFindingView[];
  openCount: number;
  criticalOpen: number;
}) {
  const openFindings = findings.filter((f) => f.status === "open");
  const groups = groupFindings(openFindings);
  const hasOpen = openFindings.length > 0;

  return (
    <section className="overflow-hidden rounded-[24px] border border-border-subtle bg-pure-white shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border-subtle px-5 py-4">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
            Compliance monitoring
          </p>
          <h2 className="mt-1 font-display text-[22px] leading-tight tracking-[-0.33px] text-ink">
            {hasOpen ? "Open findings" : "No open findings"}
          </h2>
          <p className="mt-1 text-[13px] text-ash">
            Continuous checks on AI code governance, ticket linkage, and review coverage
          </p>
        </div>
        <div className="flex items-center gap-3">
          {criticalOpen > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-rust/25 bg-rust/8 px-3 py-1.5 text-[12px] font-medium text-rust">
              <AlertTriangle className="h-3.5 w-3.5" />
              {criticalOpen} critical
            </span>
          ) : hasOpen ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-apricot/40 bg-apricot-wash/60 px-3 py-1.5 text-[12px] font-medium text-rust">
              {openCount} open
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-dove/50 bg-fog px-3 py-1.5 text-[12px] font-medium text-ash">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Compliant
            </span>
          )}
          <Link
            href="/code-analysis"
            className="text-[13px] font-medium text-ink hover:text-rust"
          >
            Code analysis
          </Link>
        </div>
      </div>

      {hasOpen ? (
        <div className="divide-y divide-border-subtle">
          {groups.map((group) => (
            <div key={group.severity} className="px-5 py-4">
              <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
                {severityLabel(group.severity)} ({group.findings.length})
              </p>
              <ul className="mt-3 space-y-3">
                {group.findings.map((finding) => (
                  <li
                    key={finding.id}
                    className={cn(
                      "rounded-[16px] border px-4 py-3",
                      SEVERITY_STYLES[finding.severity],
                    )}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[14px] font-medium text-ink">{finding.title}</p>
                        {finding.entityLabel && (
                          <p className="mt-0.5 truncate text-[13px] text-ash">
                            {finding.entityLabel}
                            {finding.repo ? ` · ${finding.repo}` : ""}
                            {finding.projectKey ? ` · ${finding.projectKey}` : ""}
                          </p>
                        )}
                        <p className="mt-1 text-[12px] text-graphite">
                          Rule: {finding.ruleKey.replace(/_/g, " ")} · Last seen{" "}
                          {new Date(finding.lastSeenAt).toLocaleDateString()}
                        </p>
                      </div>
                      {finding.entityUrl && (
                        <a
                          href={finding.entityUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex shrink-0 items-center gap-1 text-[12px] font-medium text-ink hover:text-rust"
                        >
                          View
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-6 text-[14px] text-ash">
          No compliance drift detected in the current code-analysis window. Findings are
          re-evaluated after GitHub sync and on the compliance baseline schedule.
        </div>
      )}
    </section>
  );
}
