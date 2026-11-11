"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CursorContributorTokenUsage } from "@/lib/cursor-api/types";
import { cn } from "@/lib/utils";

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return n.toLocaleString();
}

const AVATAR_TONES = [
  { bg: "bg-[#FFF0E8]", text: "text-[#C45A1A]" },
  { bg: "bg-[#FDE8EC]", text: "text-[#B4234A]" },
  { bg: "bg-[#EEE8FF]", text: "text-[#5B3CC4]" },
  { bg: "bg-[#E6F7F1]", text: "text-[#0F766E]" },
  { bg: "bg-[#FFF6E0]", text: "text-[#B45309]" },
] as const;

function avatarTone(id: string) {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash + id.charCodeAt(i) * (i + 1)) % 997;
  return AVATAR_TONES[hash % AVATAR_TONES.length]!;
}

export function ProductivityAiTokensTable({
  rows,
}: {
  rows: CursorContributorTokenUsage[];
}) {
  return (
    <Card data-slot="productivity-ai-tokens">
      <CardHeader>
        <CardTitle>AI token usage by contributor</CardTitle>
        <CardDescription>
          Person-level carve-out for this sprint — tokens and spend tied to each
          contributor’s merged PRs and Jira keys
        </CardDescription>
      </CardHeader>
      <CardContent className="px-0 pt-0">
        {rows.length === 0 ? (
          <p className="px-5 pb-5 text-[13px] text-muted">No contributor AI usage</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[700px] border-collapse text-left text-[13px]">
              <thead>
                <tr className="border-y border-border-soft text-[11px] font-medium uppercase tracking-[0.04em] text-faint">
                  <th className="px-5 py-2.5 font-medium">Contributor</th>
                  <th className="px-3 py-2.5 font-medium">Tickets</th>
                  <th className="px-3 py-2.5 text-right font-medium">PRs</th>
                  <th className="px-3 py-2.5 text-right font-medium">AI lines</th>
                  <th className="px-3 py-2.5 text-right font-medium">Tokens</th>
                  <th className="px-5 py-2.5 text-right font-medium">Spend</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const tone = avatarTone(row.contributorId);
                  return (
                    <tr
                      key={row.contributorId}
                      className="border-b border-border-soft last:border-b-0"
                    >
                      <td className="px-5 py-3 align-top">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={cn(
                              "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                              tone.bg,
                              tone.text,
                            )}
                          >
                            {row.avatarInitials}
                          </span>
                          <div className="min-w-0">
                            <div className="font-medium text-ink">{row.displayName}</div>
                            <div className="text-[11px] text-faint">
                              {row.teamKey} · {row.aiSharePct}% AI share
                            </div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-secondary">
                        <div className="max-w-[220px] truncate">
                          {row.ticketKeys.length > 0
                            ? row.ticketKeys.slice(0, 4).join(", ")
                            : "—"}
                          {row.ticketKeys.length > 4
                            ? ` +${row.ticketKeys.length - 4}`
                            : ""}
                        </div>
                      </td>
                      <td className="px-3 py-3 align-top text-right tabular-nums text-ink">
                        {row.prCount}
                      </td>
                      <td className="px-3 py-3 align-top text-right tabular-nums text-ink">
                        {row.aiLines.toLocaleString()}
                      </td>
                      <td className="px-3 py-3 align-top text-right font-medium tabular-nums text-ink">
                        {formatTokens(row.tokens)}
                      </td>
                      <td className="px-5 py-3 align-top text-right tabular-nums text-secondary">
                        ${row.spendUsd.toFixed(2)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
