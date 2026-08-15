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

  const bugEvidence = run?.evidence.filter(
    (e) => e.preset === "OPEN_BUGS" && e.issueType === "Bug",
  ) ?? [];
  const issueEvidence = run?.evidence.filter(
    (e) => e.preset === "OPEN_BUGS" && e.issueType !== "Bug",
  ) ?? [];
  const blockedEvidence = run?.evidence.filter((e) => e.preset === "BLOCKED") ?? [];

  return (
    <EngineeringDetailSection
      title="Issue evidence"
      description="Sample evidence from the latest scan — prioritize these before release."
      count={run?.evidenceCount ?? 0}
      defaultOpen
    >
      <QaFilterChips
        bugCount={bugEvidence.length}
        issueCount={issueEvidence.length}
        onFilterChange={setActiveFilter}
      />
      <div className="mt-4 space-y-6">
        {(activeFilter === "all" || activeFilter === "bugs") && (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Bugs</p>
            <QaAgentRunPanel run={run} section="bugs" issueTypeFilter="Bug" />
          </div>
        )}
        {(activeFilter === "all" || activeFilter === "issues") && (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Issues</p>
            <QaAgentRunPanel run={run} section="bugs" issueTypeFilter="!Bug" />
          </div>
        )}
        {activeFilter === "all" && blockedEvidence.length > 0 && (
          <div>
            <p className="mb-2 text-sm font-medium text-ink">Blocked</p>
            <QaAgentRunPanel run={run} section="blocked" />
          </div>
        )}
      </div>
    </EngineeringDetailSection>
  );
}
