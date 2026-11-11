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
import type { CursorAiCommit } from "@/lib/cursor-api/types";
import { cn } from "@/lib/utils";

function shortHash(hash: string): string {
  return hash.length > 8 ? hash.slice(0, 8) : hash;
}

function formatTs(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AiCommitsTable({ commits }: { commits: CursorAiCommit[] }) {
  const [open, setOpen] = useState(true);

  return (
    <Card data-slot="ai-commits-table">
      <Collapsible open={open} onOpenChange={setOpen}>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0">
          <div className="min-w-0 space-y-1.5">
            <CardTitle>Sprint commits with AI attribution</CardTitle>
            <CardDescription>
              Merged work from this sprint’s PRs — Jira keys and repos match
              Productivity; lines split Tab / Composer vs non-AI
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
            {commits.length === 0 ? (
              <p className="px-5 pb-5 text-[13px] text-muted">
                No commits in this window
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] border-collapse text-left text-[13px]">
                  <thead>
                    <tr className="border-y border-border-soft text-[11px] font-medium uppercase tracking-[0.04em] text-faint">
                      <th className="px-5 py-2.5 font-medium">Commit</th>
                      <th className="px-3 py-2.5 font-medium">Repo</th>
                      <th className="px-3 py-2.5 font-medium">Message</th>
                      <th className="px-3 py-2.5 text-right font-medium">
                        AI lines
                      </th>
                      <th className="px-5 py-2.5 text-right font-medium">
                        Non-AI
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {commits.map((commit) => {
                      const aiLines =
                        commit.tabLinesAdded + commit.composerLinesAdded;
                      return (
                        <tr
                          key={`${commit.commitHash}-${commit.commitTs}`}
                          className="border-b border-border-soft last:border-b-0"
                        >
                          <td className="px-5 py-3 align-top">
                            <div className="font-medium tabular-nums text-ink">
                              {shortHash(commit.commitHash)}
                            </div>
                            <div className="mt-0.5 text-[11px] text-faint">
                              {formatTs(commit.commitTs)}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top text-secondary">
                            <div className="max-w-[180px] truncate">
                              {commit.repoName}
                            </div>
                            <div className="mt-0.5 text-[11px] text-faint">
                              {commit.branchName}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top text-secondary">
                            <div className="max-w-[280px] truncate">
                              {commit.message}
                            </div>
                          </td>
                          <td className="px-3 py-3 align-top text-right font-medium tabular-nums text-ink">
                            {aiLines.toLocaleString()}
                          </td>
                          <td className="px-5 py-3 align-top text-right tabular-nums text-secondary">
                            {commit.nonAiLinesAdded.toLocaleString()}
                          </td>
                        </tr>
                      );
                    })}
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
