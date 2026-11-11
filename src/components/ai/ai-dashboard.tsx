import Link from "next/link";
import { PageHeader } from "@/components/layout/page-header";
import { AiKpiStrip } from "@/components/ai/ai-kpi-strip";
import {
  AiAgentEditsChart,
  AiDauChart,
  AiExtensionsChart,
  AiModelsChart,
} from "@/components/ai/ai-charts";
import { AiCommitsTable } from "@/components/ai/ai-commits-table";
import { AiToolsPanel } from "@/components/ai/ai-tools-panel";
import { AiTokenSpendCard } from "@/components/ai/ai-token-spend-card";
import { AiRoiCard } from "@/components/ai/ai-roi-card";
import { AiTicketTokensTable } from "@/components/ai/ai-ticket-tokens-table";
import type { CursorAiSnapshot } from "@/lib/cursor-api/types";
import { cn } from "@/lib/utils";

export function AiDashboard({
  snapshot,
  className,
}: {
  snapshot: CursorAiSnapshot;
  className?: string;
}) {
  return (
    <div
      className={cn("w-full space-y-[13px] pb-24 lg:pb-8", className)}
      data-slot="ai-dashboard"
    >
      <PageHeader
        title="AI"
        description="Cursor tools, token spend, ROI, and AI-assisted commits for this sprint — same repos and Jira work as Overview and Productivity."
        className="mb-[18px] [&_p]:mt-[5px]"
      />

      {snapshot.warnings.length > 0 ? (
        <div
          className="rounded-[var(--radius-card)] border border-amber/40 bg-[#FFF8E8] px-4 py-3 text-[13px] text-secondary"
          role="status"
        >
          <p className="font-medium text-ink">Some AI feeds did not load</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-muted">
            {snapshot.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <AiKpiStrip roi={snapshot.roi} />

      <div className="grid gap-3 lg:grid-cols-2">
        <AiRoiCard roi={snapshot.roi} kpis={snapshot.kpis} />
        <AiTokenSpendCard spend={snapshot.tokenSpend} />
      </div>

      <AiTicketTokensTable tickets={snapshot.tickets} />

      <p className="rounded-[var(--radius-card)] border border-border-soft bg-pure-white px-4 py-3 text-[13px] text-muted shadow-[var(--shadow)]">
        Per-contributor token usage lives on{" "}
        <Link
          href="/productivity"
          className="font-medium text-brown underline-offset-2 hover:underline"
        >
          Productivity
        </Link>{" "}
        — the only surface that groups metrics by person.
      </p>

      <AiCommitsTable commits={snapshot.commits} />

      <div className="grid gap-3 lg:grid-cols-2">
        <AiDauChart points={snapshot.dau} />
        <AiAgentEditsChart points={snapshot.agentEdits} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <AiToolsPanel tools={snapshot.tools} />
        <div className="grid gap-3">
          <AiModelsChart models={snapshot.models} />
          <AiExtensionsChart extensions={snapshot.extensions} />
        </div>
      </div>

      <p className="text-[11px] text-faint">
        Source: AppData mock (productivity PRs + sprint window) · synced{" "}
        {new Date(snapshot.fetchedAt).toLocaleString()}
      </p>
    </div>
  );
}
