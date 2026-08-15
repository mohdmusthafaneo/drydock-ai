"use client";

import { useState } from "react";
import type { LatestQaRunSummary } from "@/lib/agent-analysis/types";
import { QaFilterChips, type QaFilter } from "./qa-filter-chips";
import { QaAgentRunPanel } from "./qa-agent-run-panel";
import { EngineeringDetailSection } from "@/components/agent-analysis/engineering-detail-section";

type Props = {
  run: LatestQaRunSummary | null;
};

export function QaEvidenceSection({ run }: Props) {
  const [activeFilter, setActiveFilter] = useState<QaFilter>("all");

  // Taxonomy (driven by JQL behind the QA agent scan):
  //   Bugs  → preset = OPEN_BUGS (JQL: issuetype = Bug AND status = Open)
  //   Issues → any preset where issueType !== "Bug" (Stories, Tasks, Epics, etc.)
  const allEvidence = run?.evidence ?? [];
  const bugEvidence = allEvidence.filter((e) => e.preset === "OPEN_BUGS");
  const issueEvidence = allEvidence.filter((e) => e.issueType !== "Bug");

  // Chip counts from headline fields (not evidence-array sampling)
  const bugCount = run?.openBugs ?? 0;
  const issueCount = (run?.open ?? 0) - (run?.openBugs ?? 0);

  return (
    <>
      {/* Chips and taxonomy note — outside the collapsible section */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <QaFilterChips
          bugCount={bugCount}
          issueCount={issueCount}
          onFilterChange={setActiveFilter}
        />
        <p className="text-[12px] text-muted">
          <span className="font-medium text-graphite">Bug</span>
          {" = Jira Bug issuetype. "}
          <span className="font-medium text-graphite">Issue</span>
          {" = every other issuetype."}
        </p>
      </div>

      <EngineeringDetailSection
        title="Issue evidence"
        description="Sample evidence from the latest scan — prioritize these before release."
        count={run?.evidenceCount ?? 0}
        defaultOpen
      >
        <div className="space-y-6">
          {activeFilter === "all" && (
            <>
              <EvidenceGroup title="Blocked" rows={allEvidence.filter((e) => e.preset === "BLOCKED")} empty="No blocked evidence in the latest sample." />
              <EvidenceGroup title="Bugs" rows={bugEvidence} empty="No open-bug evidence in the latest sample." />
              <EvidenceGroup title="Issues" rows={issueEvidence} empty="No non-Bug evidence in the latest sample." />
            </>
          )}
          {activeFilter === "bugs" && (
            <EvidenceGroup title="Bugs" rows={bugEvidence} empty="No open-bug evidence in the latest sample." />
          )}
          {activeFilter === "issues" && (
            <EvidenceGroup title="Issues" rows={issueEvidence} empty="No non-Bug evidence in the latest sample." />
          )}
        </div>
      </EngineeringDetailSection>
    </>
  );
}

function EvidenceGroup({
  title,
  rows,
  empty,
}: {
  title: string;
  rows: LatestQaRunSummary["evidence"];
  empty: string;
}) {
  return (
    <div>
      <p className="mb-2 text-sm font-medium text-ink">{title}</p>
      <QaAgentRunPanel run={null} section="all" evidenceOverride={rows} emptyMessage={empty} />
    </div>
  );
}
