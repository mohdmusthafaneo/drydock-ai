"use client";

import { PageHeader } from "@/components/layout/page-header";
import { DeliveryAnalysisDashboard } from "@/components/delivery-analysis/delivery-analysis-dashboard";
import {
  ConnectJiraEmpty,
  SelectProjectsEmpty,
  SyncJiraEmpty,
} from "@/components/delivery-analysis/connect-jira-empty";

type Props = {
  jiraConnected: boolean;
  projectKeys: string[];
  hasSnapshot: boolean;
  lastSyncedAt: string | null;
};

export function DeliveryAnalysisPageClient({
  jiraConnected,
  projectKeys,
  hasSnapshot,
  lastSyncedAt,
}: Props) {
  return (
    <div className="w-full space-y-[13px] pb-24 lg:pb-8">
      <PageHeader
        title="Delivery analysis"
        description="See blockers, overdue work, version targets, and sprint progress from Jira — so leaders can govern delivery with evidence, not dashboard hopping."
      />

      {!jiraConnected ? (
        <ConnectJiraEmpty />
      ) : projectKeys.length === 0 ? (
        <SelectProjectsEmpty />
      ) : !hasSnapshot ? (
        <SyncJiraEmpty projectKeys={projectKeys} />
      ) : (
        <DeliveryAnalysisDashboard
          projectKeys={projectKeys}
          lastSyncedAt={lastSyncedAt}
        />
      )}
    </div>
  );
}
