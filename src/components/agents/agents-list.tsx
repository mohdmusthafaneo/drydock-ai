"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";
import { agentKeys } from "@/lib/queries/keys";
import {
  QueryPanelError,
  QueryPanelLoading,
} from "@/components/ui/query-panel-state";
import type { AgentCatalogEntry } from "@/lib/agents/keys";

type AgentSummary = AgentCatalogEntry & {
  instructionCount: number;
  enabledInstructionCount: number;
};

async function fetchAgents(): Promise<AgentSummary[]> {
  const res = await fetch("/api/agents", { credentials: "same-origin" });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to load agents");
  }
  const data = (await res.json()) as { agents: AgentSummary[] };
  return data.agents;
}

export function AgentsList() {
  const query = useQuery({
    queryKey: agentKeys.list(),
    queryFn: fetchAgents,
  });

  if (query.isLoading) {
    return <QueryPanelLoading label="Loading agents…" />;
  }

  if (query.isError || !query.data) {
    return (
      <QueryPanelError
        message={
          query.error instanceof Error
            ? query.error.message
            : "Failed to load agents"
        }
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {query.data.map((agent) => (
        <Link
          key={agent.key}
          href={`/agents/${agent.key}`}
          className="group flex flex-col rounded-[14px] border border-border bg-pure-white p-4 shadow-[0_2px_7px_rgba(16,24,40,0.04)] transition-colors hover:border-accent/40"
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-[15px] font-semibold text-ink">{agent.label}</h2>
              <p className="mt-1 text-[13px] leading-snug text-muted">
                {agent.description}
              </p>
            </div>
            <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-faint transition-colors group-hover:text-accent" />
          </div>
          <p className="mt-4 text-[12px] text-faint">
            {agent.instructionCount === 0
              ? "No org instructions yet"
              : `${agent.enabledInstructionCount} enabled · ${agent.instructionCount} total`}
          </p>
        </Link>
      ))}
    </div>
  );
}
