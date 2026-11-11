"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import type { CursorTicketTokenUsage } from "@/lib/cursor-api/types";
import { cn } from "@/lib/utils";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return n.toLocaleString();
}

const ATTR_LABEL: Record<CursorTicketTokenUsage["attribution"], string> = {
  ai_generated: "AI generated",
  ai_assisted: "AI assisted",
  human_only: "Mostly human",
  mixed: "Mixed",
};

const ATTR_TONE: Record<CursorTicketTokenUsage["attribution"], string> = {
  ai_generated: "bg-[#EEE8FF] text-[#5B3CC4]",
  ai_assisted: "bg-[#FFF0E8] text-[#C45A1A]",
  human_only: "bg-elevated text-muted",
  mixed: "bg-[#E8F1FF] text-[#1D4ED8]",
};

export function AiTicketTokensTable({
  tickets,
}: {
  tickets: CursorTicketTokenUsage[];
}) {
  const [open, setOpen] = useState(true);

  return (
    <Card data-slot="ai-ticket-tokens">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 space-y-1.5">
            <CardTitle>Token usage by ticket</CardTitle>
            <CardDescription>
              Jira keys from this sprint’s merged PRs — spend attributed to work
              items, not people
            </CardDescription>
          </div>
          <CollapsibleTrigger
            type="button"
            className="inline-flex shrink-0 items-center gap-1.5 rounded-[8px] border border-border-soft px-2.5 py-1.5 text-[12px] font-medium text-secondary transition-colors hover:bg-elevated/60"
            aria-expanded={open}
          >
            {open ? "Collapse" : "Expand"}
            <ChevronDown
              className={cn(
                "h-3.5 w-3.5 transition-transform",
                open && "rotate-180",
              )}
            />
          </CollapsibleTrigger>
        </CardHeader>
        <CollapsibleContent>
          <CardContent className="px-0 pt-0">
            {tickets.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-muted">
                No tickets in this window
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-y border-border-soft text-[11px] font-medium uppercase tracking-[0.04em] text-faint">
                      <th className="px-5 py-2.5 font-medium">Ticket</th>
                      <th className="px-3 py-2.5 font-medium">Summary</th>
                      <th className="px-3 py-2.5 font-medium">Mix</th>
                      <th className="px-3 py-2.5 text-right font-medium">
                        AI lines
                      </th>
                      <th className="px-3 py-2.5 text-right font-medium">
                        Tokens
                      </th>
                      <th className="px-5 py-2.5 text-right font-medium">
                        Spend
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {tickets.map((ticket) => (
                      <tr
                        key={ticket.jiraKey}
                        className="border-b border-border-soft last:border-b-0"
                      >
                        <td className="px-5 py-3 align-top">
                          <div className="font-medium text-ink">
                            {ticket.jiraKey}
                          </div>
                          <div className="mt-0.5 text-[11px] text-faint">
                            {ticket.repoName} · {ticket.prCount} PR
                            {ticket.prCount === 1 ? "" : "s"}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top text-secondary">
                          <div className="max-w-[280px] truncate">
                            {ticket.summary}
                          </div>
                        </td>
                        <td className="px-3 py-3 align-top">
                          <span
                            className={cn(
                              "inline-flex rounded-[6px] px-1.5 py-0.5 text-[11px] font-medium",
                              ATTR_TONE[ticket.attribution],
                            )}
                          >
                            {ATTR_LABEL[ticket.attribution]}
                          </span>
                        </td>
                        <td className="px-3 py-3 align-top text-right tabular-nums text-ink">
                          {ticket.aiLines.toLocaleString()}
                        </td>
                        <td className="px-3 py-3 align-top text-right font-medium tabular-nums text-ink">
                          {formatTokens(ticket.tokens)}
                        </td>
                        <td className="px-5 py-3 align-top text-right tabular-nums text-secondary">
                          ${ticket.spendUsd.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </CollapsibleContent>
      </Collapsible>
    </Card>
  );
}
