"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronDown, ExternalLink, Search } from "lucide-react";
import type {
  CodeAnalysisCommit,
  CodeAnalysisPullRequest,
  CodeAnalysisSnapshot,
} from "@/lib/code-analysis/types";
import { ATTRIBUTION_LABELS } from "@/lib/code-analysis/types";
import { buildJiraIssueBrowseUrl } from "@/lib/code-analysis/jira-link";
import { attributionBadgeClass } from "@/components/code-analysis/attribution-chart";
import { GovernanceSignalsPanel } from "@/components/code-analysis/governance-signals";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

type TabId = "pull_requests" | "commits" | "files" | "tools" | "governance";

const TABS: { id: TabId; label: string }[] = [
  { id: "pull_requests", label: "Pull requests" },
  { id: "commits", label: "Commits" },
  { id: "files", label: "Files" },
  { id: "tools", label: "Tools" },
  { id: "governance", label: "Governance" },
];

type SortDir = "asc" | "desc";

export function AnalysisTabs({
  snapshot,
  jiraSiteUrl,
}: {
  snapshot: CodeAnalysisSnapshot;
  jiraSiteUrl?: string | null;
}) {
  const [tab, setTab] = useState<TabId>("pull_requests");
  const [search, setSearch] = useState("");
  const [expandedPr, setExpandedPr] = useState<string | null>(null);
  const [expandedCommit, setExpandedCommit] = useState<string | null>(null);
  const [prSort, setPrSort] = useState<{ key: keyof CodeAnalysisPullRequest; dir: SortDir }>({
    key: "mergedAt",
    dir: "desc",
  });
  const [commitSort, setCommitSort] = useState<{ key: keyof CodeAnalysisCommit; dir: SortDir }>({
    key: "committedAt",
    dir: "desc",
  });

  const filteredPrs = useMemo(() => {
    const q = search.toLowerCase();
    let rows = snapshot.pullRequests;
    if (q) {
      rows = rows.filter(
        (p) =>
          p.title.toLowerCase().includes(q) ||
          p.repo.toLowerCase().includes(q) ||
          p.author.toLowerCase().includes(q),
      );
    }
    return [...rows].sort((a, b) => {
      const av = a[prSort.key];
      const bv = b[prSort.key];
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av > bv ? 1 : -1;
      return prSort.dir === "asc" ? cmp : -cmp;
    });
  }, [snapshot.pullRequests, search, prSort]);

  const filteredCommits = useMemo(() => {
    const q = search.toLowerCase();
    let rows = snapshot.commits;
    if (q) {
      rows = rows.filter(
        (c) =>
          c.message.toLowerCase().includes(q) ||
          c.repo.toLowerCase().includes(q) ||
          c.author.toLowerCase().includes(q),
      );
    }
    return [...rows].sort((a, b) => {
      const av = a[commitSort.key];
      const bv = b[commitSort.key];
      if (av === bv) return 0;
      if (av == null) return 1;
      if (bv == null) return -1;
      const cmp = av > bv ? 1 : -1;
      return commitSort.dir === "asc" ? cmp : -cmp;
    });
  }, [snapshot.commits, search, commitSort]);

  function togglePrSort(key: keyof CodeAnalysisPullRequest) {
    setPrSort((s) => ({
      key,
      dir: s.key === key && s.dir === "desc" ? "asc" : "desc",
    }));
  }

  function toggleCommitSort(key: keyof CodeAnalysisCommit) {
    setCommitSort((s) => ({
      key,
      dir: s.key === key && s.dir === "desc" ? "asc" : "desc",
    }));
  }

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-base">Drill-down</CardTitle>
            <CardDescription>Inspect PRs, commits, and governance signals</CardDescription>
          </div>
          {tab !== "governance" && tab !== "tools" && (
            <div className="relative w-full sm:max-w-xs">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search…"
                className="h-8 pl-8 text-sm"
              />
            </div>
          )}
        </div>

        <div className="-mx-1 flex gap-1 overflow-x-auto pb-1">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={cn(
                "shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors",
                tab === t.id
                  ? "bg-sky-wash text-chart-blue"
                  : "text-secondary hover:bg-hover hover:text-primary",
              )}
            >
              {t.label}
              {t.id === "pull_requests" && (
                <span className="ml-1 text-muted">({snapshot.pullRequests.length})</span>
              )}
              {t.id === "governance" && snapshot.governanceSignals.length > 0 && (
                <span className="ml-1 rounded-full bg-warning-muted px-1.5 text-warning">
                  {snapshot.governanceSignals.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </CardHeader>

      <CardContent>
        {tab === "pull_requests" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <SortHeader label="PR" onClick={() => togglePrSort("number")} />
                  <th className="pb-2 font-medium">Repo</th>
                  <SortHeader label="Author" onClick={() => togglePrSort("author")} />
                  <SortHeader label="Merged" onClick={() => togglePrSort("mergedAt")} />
                  <SortHeader label="Lines" onClick={() => togglePrSort("linesAdded")} />
                  <th className="pb-2 font-medium">AI attribution</th>
                  <th className="pb-2 font-medium">Jira</th>
                  <th className="pb-2 font-medium">Reviews</th>
                </tr>
              </thead>
              <tbody>
                {filteredPrs.map((pr) => (
                  <Fragment key={pr.id}>
                    <tr
                      className="cursor-pointer border-b border-border-subtle hover:bg-hover"
                      onClick={() => setExpandedPr(expandedPr === pr.id ? null : pr.id)}
                    >
                      <td className="py-2.5">
                        <a
                          href={pr.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-brand hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          #{pr.number}
                          <ExternalLink className="h-3 w-3 opacity-60" />
                        </a>
                        <p className="max-w-[200px] truncate text-xs text-secondary">{pr.title}</p>
                      </td>
                      <td className="py-2.5 text-xs text-secondary">{pr.repo.split("/")[1]}</td>
                      <td className="py-2.5">{pr.author}</td>
                      <td className="py-2.5 text-xs text-muted">
                        {new Date(pr.mergedAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 tabular-nums">
                        <span className="text-success">+{pr.linesAdded}</span>
                        <span className="text-muted"> / -{pr.linesRemoved}</span>
                      </td>
                      <td className="py-2.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            attributionBadgeClass(pr.attribution),
                          )}
                        >
                          {ATTRIBUTION_LABELS[pr.attribution]} · {pr.confidence}%
                        </span>
                      </td>
                      <td className="py-2.5">
                        <JiraKeyChips keys={pr.jiraKeys} siteUrl={jiraSiteUrl} />
                      </td>
                      <td className="py-2.5">
                        {pr.reviewCount === 0 && pr.attribution !== "human_only" ? (
                          <Badge variant="warning">Gap</Badge>
                        ) : (
                          <span className="tabular-nums text-secondary">{pr.reviewCount}</span>
                        )}
                      </td>
                    </tr>
                    {expandedPr === pr.id && (
                      <tr className="bg-elevated/40">
                        <td colSpan={8} className="px-3 py-3 text-xs text-secondary">
                          <p className="font-medium text-primary">{pr.title}</p>
                          <p className="mt-1">
                            Tools detected:{" "}
                            {pr.tools.length > 0 ? pr.tools.join(", ") : "None identified"}
                          </p>
                          {pr.riskLevel && pr.riskLevel !== "low" && (
                            <p className="mt-1">
                              Risk: {pr.riskScore}/100 ({pr.riskLevel})
                              {pr.qualityFlags?.length
                                ? ` — ${pr.qualityFlags.join(", ")}`
                                : ""}
                            </p>
                          )}
                          {pr.completionScore != null && (
                            <p className="mt-1">
                              Ticket completion: {pr.completionScore}%
                              {pr.completionRationale ? ` — ${pr.completionRationale}` : ""}
                            </p>
                          )}
                          <p className="mt-1 text-muted">
                            Estimated from commit messages, co-author trailers, and change patterns.
                            Not all tools leave markers.
                          </p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "commits" && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="pb-2 font-medium">SHA</th>
                  <SortHeader label="Message" onClick={() => toggleCommitSort("message")} />
                  <th className="pb-2 font-medium">Author</th>
                  <SortHeader label="Date" onClick={() => toggleCommitSort("committedAt")} />
                  <SortHeader label="Lines" onClick={() => toggleCommitSort("additions")} />
                  <th className="pb-2 font-medium">Classification</th>
                  <th className="pb-2 font-medium">Jira</th>
                </tr>
              </thead>
              <tbody>
                {filteredCommits.map((c) => (
                  <Fragment key={c.sha}>
                    <tr
                      className="cursor-pointer border-b border-border-subtle hover:bg-hover"
                      onClick={() => setExpandedCommit(expandedCommit === c.sha ? null : c.sha)}
                    >
                      <td className="py-2.5">
                        <a
                          href={c.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-mono text-xs text-brand hover:underline"
                          onClick={(e) => e.stopPropagation()}
                        >
                          {c.sha}
                        </a>
                      </td>
                      <td className="max-w-[220px] truncate py-2.5">{c.message}</td>
                      <td className="py-2.5">{c.author}</td>
                      <td className="py-2.5 text-xs text-muted">
                        {new Date(c.committedAt).toLocaleDateString()}
                      </td>
                      <td className="py-2.5 tabular-nums">
                        +{c.additions} / -{c.deletions}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2 py-0.5 text-xs font-medium",
                            attributionBadgeClass(c.attribution),
                          )}
                        >
                          {ATTRIBUTION_LABELS[c.attribution]}
                        </span>
                      </td>
                      <td className="py-2.5">
                        <JiraKeyChips keys={c.jiraKeys} siteUrl={jiraSiteUrl} />
                      </td>
                    </tr>
                    {expandedCommit === c.sha && (
                      <tr className="bg-elevated/40">
                        <td colSpan={7} className="px-3 py-3 text-xs text-secondary">
                          <p className="font-medium text-primary">Matched signals</p>
                          {c.signals.length > 0 ? (
                            <ul className="mt-1 list-disc pl-4">
                              {c.signals.map((s) => (
                                <li key={s}>{s}</li>
                              ))}
                            </ul>
                          ) : (
                            <p className="mt-1 text-muted">
                              No AI markers detected — classified as human-only.
                            </p>
                          )}
                          <p className="mt-2 text-muted">Confidence: {c.confidence}%</p>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "files" && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs text-muted">
                  <th className="pb-2 font-medium">Path</th>
                  <th className="pb-2 font-medium">Repo</th>
                  <th className="pb-2 font-medium">Changes</th>
                  <th className="pb-2 text-right font-medium">AI lines</th>
                  <th className="pb-2 font-medium">Contributors</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.files.map((f) => (
                  <tr key={f.path} className="border-b border-border-subtle">
                    <td className="max-w-[280px] truncate py-2 font-mono text-xs">{f.path}</td>
                    <td className="py-2 text-xs text-secondary">{f.repo.split("/")[1]}</td>
                    <td className="py-2 tabular-nums">{f.changeCount}</td>
                    <td className="py-2 text-right tabular-nums">
                      <span className={f.aiLinesPct >= 50 ? "text-rust" : "text-secondary"}>
                        {f.aiLinesPct}%
                      </span>
                    </td>
                    <td className="py-2 text-xs text-muted">{f.topContributors.join(", ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {tab === "tools" && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {snapshot.tools.length === 0 ? (
              <p className="text-sm text-muted">No tools detected in this period.</p>
            ) : (
              snapshot.tools.map((tool) => (
                <div
                  key={tool.name}
                  className="rounded-lg border border-border-subtle bg-elevated/40 p-4"
                >
                  <p className="font-medium text-primary">{tool.name}</p>
                  <dl className="mt-3 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <dt className="text-muted">Lines attributed</dt>
                      <dd className="tabular-nums text-secondary">
                        {tool.linesAttributed.toLocaleString()}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">Commits</dt>
                      <dd className="tabular-nums text-secondary">{tool.commitsAttributed}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted">PRs</dt>
                      <dd className="tabular-nums text-secondary">{tool.prsAttributed}</dd>
                    </div>
                  </dl>
                </div>
              ))
            )}
            <div className="rounded-lg border border-dashed border-border p-4 text-xs text-muted sm:col-span-2 lg:col-span-3">
              Tool detection relies on commit trailers and message patterns. Unmarked AI usage appears
              as human-only or unknown until Phase 2 heuristics improve.
            </div>
          </div>
        )}

        {tab === "governance" && (
          <GovernanceSignalsPanel signals={snapshot.governanceSignals} />
        )}
      </CardContent>
    </Card>
  );
}

function JiraKeyChips({
  keys,
  siteUrl,
}: {
  keys: string[];
  siteUrl?: string | null;
}) {
  if (!keys?.length) {
    return (
      <Badge variant="muted" className="text-[10px] font-normal">
        None
      </Badge>
    );
  }

  return (
    <div className="flex flex-wrap gap-1">
      {keys.map((key) =>
        siteUrl ? (
          <a
            key={key}
            href={buildJiraIssueBrowseUrl(siteUrl, key)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
          >
            <Badge variant="default" className="text-[10px] font-mono hover:bg-hover">
              {key}
            </Badge>
          </a>
        ) : (
          <Badge key={key} variant="default" className="text-[10px] font-mono">
            {key}
          </Badge>
        ),
      )}
    </div>
  );
}

function SortHeader({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <th className="pb-2 font-medium">
      <button
        type="button"
        onClick={onClick}
        className="inline-flex items-center gap-0.5 hover:text-primary"
      >
        {label}
        <ChevronDown className="h-3 w-3 opacity-50" />
      </button>
    </th>
  );
}
