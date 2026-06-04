"use client";

import { useState } from "react";
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
  canSync: boolean;
};

export function DeliveryAnalysisPageClient({
  jiraConnected,
  projectKeys,
  hasSnapshot,
  lastSyncedAt,
  canSync,
}: Props) {
  const [showDemo, setShowDemo] = useState(false);

  const showDashboard = hasSnapshot || showDemo;

  return (
    <div className="w-full space-y-8 pb-24 lg:pb-8">
      <PageHeader
        title="Delivery analysis"
        description="See blockers, overdue work, version targets, and sprint progress from Jira — so leaders can govern delivery with evidence, not dashboard hopping."
      />

      {!jiraConnected ? (
        <ConnectJiraEmpty />
      ) : projectKeys.length === 0 ? (
        <SelectProjectsEmpty />
      ) : !showDashboard ? (
        <SyncJiraEmpty projectKeys={projectKeys} onPreviewDemo={() => setShowDemo(true)} />
      ) : (
        <DeliveryAnalysisDashboard
          projectKeys={projectKeys}
          lastSyncedAt={lastSyncedAt}
          canSync={canSync}
          isDemo={!hasSnapshot}
        />
      )}
    </div>
  );
}
