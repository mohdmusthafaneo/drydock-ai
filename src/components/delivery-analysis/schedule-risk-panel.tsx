"use client";

import { ExternalLink } from "lucide-react";
import { useDeepLinkHighlight } from "@/components/motion/use-deep-link-highlight";
import { RevealSection } from "@/components/motion/reveal-section";
import { SCHEDULE_RISK_HASH } from "@/lib/overview/nav-context";
import type { ScheduleRiskEvidence } from "@/lib/delivery-analysis/types";
import { cn } from "@/lib/utils";

type Props = {
  risk: ScheduleRiskEvidence;
  className?: string;
  /** Org / portfolio label from the shell. */
  organizationName?: string | null;
  /** When true, treat as Overview deep-link landing target. */
  deepLink?: boolean;
};

export function ScheduleRiskPanel({
  risk,
  className,
  organizationName,
  deepLink = false,
}: Props) {
  const { ref, highlightClass } = useDeepLinkHighlight<HTMLElement>({
    hash: deepLink ? SCHEDULE_RISK_HASH : undefined,
    search: deepLink
      ? { key: "riskFocus", value: "schedule" }
      : undefined,
  });

  if (risk.total <= 0) return null;

  const teams = risk.byTeam.filter((t) => t.count > 0);
  const scopeLabel = organizationName ?? null;

  return (
    <RevealSection
      ref={ref}
      id={SCHEDULE_RISK_HASH}
      tabIndex={-1}
      aria-label={`${risk.total} items at risk of spillover`}
      className={cn(
        "scroll-mt-6 rounded-[var(--radius-card)] border border-border bg-pure-white px-6 py-6 shadow-[var(--shadow)] outline-none",
        highlightClass,
        className,
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex w-fit items-center rounded-[8px] border border-[#ffe0d1] bg-[#fff0e8] px-2.5 py-1 text-[11px] font-medium leading-none text-coral">
              Schedule risk
            </span>
            {scopeLabel ? (
              <span className="text-[12px] text-muted">{scopeLabel}</span>
            ) : null}
          </div>
          <h2 className="mt-3 text-[18px] font-semibold leading-[1.25] tracking-[-0.2px] text-ink sm:text-[20px]">
            {risk.total.toLocaleString()} item{risk.total === 1 ? "" : "s"} at
            risk of spillover
          </h2>
          <p className="mt-1.5 max-w-3xl text-[15px] leading-relaxed text-secondary sm:text-[16px]">
            {risk.definition}
          </p>
        </div>
        {risk.jiraUrl ? (
          <a
            href={risk.jiraUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center gap-1 self-start pt-0.5 text-sm font-medium text-brand hover:underline"
          >
            View all in Jira
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        ) : null}
      </div>

      {teams.length > 0 ? (
        <div className="mt-5 border-t border-border pt-4">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">
            By team
          </p>
          <ul className="mt-2 divide-y divide-border-subtle rounded-[10px] border border-border">
            {teams.map((team) => {
              const rowClass =
                "flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left transition-colors";
              const content = (
                <>
                  <span className="min-w-0 truncate text-[14px] font-medium text-ink">
                    {team.name}
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="tabular-nums text-[15px] font-semibold text-ink">
                      {team.count}
                    </span>
                    {team.jiraUrl ? (
                      <ExternalLink
                        className="h-3.5 w-3.5 text-muted"
                        aria-hidden
                      />
                    ) : null}
                  </span>
                </>
              );

              return (
                <li key={team.key}>
                  {team.jiraUrl ? (
                    <a
                      href={team.jiraUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={cn(rowClass, "hover:bg-hover")}
                      aria-label={`View ${team.count} at-risk items for ${team.name} in Jira`}
                    >
                      {content}
                    </a>
                  ) : (
                    <div className={rowClass}>{content}</div>
                  )}
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-[12px] text-muted">
            Open a team to review the matching issues in Jira.
          </p>
        </div>
      ) : risk.jiraUrl ? (
        <p className="mt-5 text-[15px] leading-relaxed text-secondary">
          <a
            href={risk.jiraUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
          >
            View the {risk.total.toLocaleString()} at-risk issue
            {risk.total === 1 ? "" : "s"} in Jira
            <ExternalLink className="h-3.5 w-3.5" aria-hidden />
          </a>
        </p>
      ) : null}
    </RevealSection>
  );
}
