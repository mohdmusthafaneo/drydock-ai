"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
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

type ComplianceFindingAction = "resolve" | "dismiss" | "acknowledge";

export function ComplianceFindingsPanel({
  findings,
  openCount,
  criticalOpen,
  canManage = false,
}: {
  findings: ComplianceFindingView[];
  openCount: number;
  criticalOpen: number;
  canManage?: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [projectKey, setProjectKey] = useState<string>("all");
  const [actionError, setActionError] = useState<string | null>(null);

  const projectKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const finding of findings) {
      if (finding.projectKey) keys.add(finding.projectKey);
    }
    return [...keys].sort();
  }, [findings]);

  const filteredFindings = useMemo(() => {
    if (projectKey === "all") return findings;
    return findings.filter((f) => f.projectKey === projectKey);
  }, [findings, projectKey]);

  const openFindings = filteredFindings.filter((f) => f.status === "open");
  const groups = groupFindings(openFindings);
  const hasOpen = openFindings.length > 0;
  const filteredOpenCount = openFindings.length;
  const filteredCriticalOpen = openFindings.filter((f) => f.severity === "critical").length;

  async function runAction(findingId: string, action: ComplianceFindingAction) {
    setActionError(null);
    const res = await fetch(`/api/compliance/findings/${findingId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ action }),
    });

    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setActionError(body.error ?? "Action failed");
      return;
    }

    startTransition(() => {
      router.refresh();
    });
  }

  return (
    <section className="overflow-hidden rounded-[var(--radius-card)] border border-border bg-pure-white shadow-[var(--shadow)]">
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-border px-5 py-4">
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
        <div className="flex flex-wrap items-center gap-3">
          {projectKeys.length > 0 && (
            <label className="flex items-center gap-2 text-[12px] text-graphite">
              <span className="sr-only">Filter by project</span>
              <select
                value={projectKey}
                onChange={(e) => setProjectKey(e.target.value)}
                className="rounded-[8px] border border-border bg-fog px-3 py-1.5 text-[12px] font-medium text-ink"
              >
                <option value="all">All projects</option>
                {projectKeys.map((key) => (
                  <option key={key} value={key}>
                    {key}
                  </option>
                ))}
              </select>
            </label>
          )}
          {filteredCriticalOpen > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-rust/25 bg-rust/8 px-3 py-1.5 text-[12px] font-medium text-rust">
              <AlertTriangle className="h-3.5 w-3.5" />
              {filteredCriticalOpen} critical
            </span>
          ) : hasOpen ? (
            <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-apricot/40 bg-apricot-wash/60 px-3 py-1.5 text-[12px] font-medium text-rust">
              {filteredOpenCount} open
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 rounded-[8px] border border-dove/50 bg-fog px-3 py-1.5 text-[12px] font-medium text-ash">
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

      {actionError && (
        <p className="border-b border-border bg-rust/5 px-5 py-2 text-[13px] text-rust">
          {actionError}
        </p>
      )}

      {hasOpen ? (
        <div className="divide-y divide-border">
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
                      "rounded-[var(--radius-card)] border px-4 py-3",
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
                      <div className="flex shrink-0 flex-wrap items-center gap-2">
                        {canManage && (
                          <>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => void runAction(finding.id, "acknowledge")}
                              className="rounded-[8px] border border-border bg-pure-white px-2.5 py-1 text-[11px] font-medium text-ink hover:border-dove disabled:opacity-50"
                            >
                              Acknowledge
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => void runAction(finding.id, "resolve")}
                              className="rounded-[8px] border border-border bg-pure-white px-2.5 py-1 text-[11px] font-medium text-ink hover:border-dove disabled:opacity-50"
                            >
                              Resolve
                            </button>
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => void runAction(finding.id, "dismiss")}
                              className="rounded-[8px] border border-border bg-pure-white px-2.5 py-1 text-[11px] font-medium text-ash hover:border-dove disabled:opacity-50"
                            >
                              Dismiss
                            </button>
                          </>
                        )}
                        {finding.entityUrl && (
                          <a
                            href={finding.entityUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[12px] font-medium text-ink hover:text-rust"
                          >
                            View
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : (
        <div className="px-5 py-6 text-[14px] text-ash">
          {projectKey !== "all" && openCount > 0
            ? `No open findings for project ${projectKey}.`
            : "No compliance drift detected in the current code-analysis window. Findings are re-evaluated after GitHub sync and on the compliance baseline schedule."}
        </div>
      )}

      {projectKey === "all" && criticalOpen > 0 && filteredCriticalOpen === 0 && hasOpen && (
        <p className="border-t border-border-subtle px-5 py-3 text-[12px] text-graphite">
          {openCount} open across all projects ({criticalOpen} critical).
        </p>
      )}
    </section>
  );
}
