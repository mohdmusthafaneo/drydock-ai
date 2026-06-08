"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ToolchainMapping } from "@/lib/toolchain-mapping";

export function ToolchainMappingForm({
  initialMapping,
  confirmed,
  syncReady,
}: {
  initialMapping: ToolchainMapping;
  confirmed: boolean;
  syncReady: boolean;
}) {
  const router = useRouter();
  const [mapping, setMapping] = useState(initialMapping);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMapping(initialMapping);
  }, [initialMapping]);

  async function save(confirm: boolean) {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/governance/toolchain-mapping", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ ...mapping, confirm }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to save");
      return;
    }
    router.refresh();
  }

  if (!syncReady) {
    return (
      <Card className="border-dashed border-[#4F8CFF]/30">
        <CardContent className="py-10 text-center text-slate-400">
          Connect Jira or GitHub, select projects/repos, and run an initial sync before mapping
          your delivery toolchain.
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Jira workflow semantics</CardTitle>
          <CardDescription>
            Inferred from your synced projects and boards. Adjust if your team uses different
            names or patterns.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mapping.jira ? (
            <>
              <Field label="Methodology">
                <select
                  value={mapping.jira.methodology}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      jira: {
                        ...m.jira!,
                        methodology: e.target.value as NonNullable<
                          ToolchainMapping["jira"]
                        >["methodology"],
                      },
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
                >
                  <option value="scrum">Scrum (sprints)</option>
                  <option value="kanban">Kanban (flow)</option>
                  <option value="mixed">Mixed</option>
                  <option value="custom">Custom</option>
                </select>
              </Field>
              <Field label="Release tracking">
                <select
                  value={mapping.jira.releaseTracking}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      jira: {
                        ...m.jira!,
                        releaseTracking: e.target.value as "fixVersion" | "sprint" | "labels" | "none",
                      },
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
                >
                  <option value="fixVersion">Fix versions</option>
                  <option value="sprint">Sprint milestones</option>
                  <option value="labels">Labels</option>
                  <option value="none">Not tracked in Jira</option>
                </select>
              </Field>
              <Field label="Blocked status name">
                <input
                  value={mapping.jira.blockedStatusName}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      jira: { ...m.jira!, blockedStatusName: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Bug issue type">
                <input
                  value={mapping.jira.bugIssueType}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      jira: { ...m.jira!, bugIssueType: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
                />
              </Field>
            </>
          ) : (
            <p className="text-sm text-slate-500">Connect and sync Jira to infer workflow defaults.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>GitHub delivery patterns</CardTitle>
          <CardDescription>
            Inferred from selected repositories. Used for code analysis and release correlation.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {mapping.github ? (
            <>
              <Field label="Primary default branch">
                <input
                  value={mapping.github.primaryDefaultBranch}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      github: { ...m.github!, primaryDefaultBranch: e.target.value },
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
                />
              </Field>
              <Field label="Branch strategy">
                <select
                  value={mapping.github.branchStrategy}
                  onChange={(e) =>
                    setMapping((m) => ({
                      ...m,
                      github: {
                        ...m.github!,
                        branchStrategy: e.target.value as
                          | "trunk"
                          | "gitflow"
                          | "release-branches"
                          | "custom",
                      },
                    }))
                  }
                  className="w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
                >
                  <option value="trunk">Trunk-based (main)</option>
                  <option value="gitflow">GitFlow (main + develop)</option>
                  <option value="release-branches">Release branches</option>
                  <option value="custom">Custom</option>
                </select>
              </Field>
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Connect and sync GitHub to infer branch and PR patterns.
            </p>
          )}
        </CardContent>
      </Card>

      {mapping.inferredFrom && (
        <p className="text-xs text-slate-500">
          Suggestions based on discovery answers
          {mapping.inferredFrom.discoveryWorkflows?.length
            ? ` (${mapping.inferredFrom.discoveryWorkflows.join(", ")})`
            : ""}
          {mapping.inferredFrom.jiraSyncedAt ? ` · Jira synced ${mapping.inferredFrom.jiraSyncedAt}` : ""}
          {mapping.inferredFrom.githubSyncedAt
            ? ` · GitHub synced ${mapping.inferredFrom.githubSyncedAt}`
            : ""}
        </p>
      )}

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => save(false)} disabled={loading}>
          Save draft
        </Button>
        <Button onClick={() => save(true)} disabled={loading || confirmed}>
          {confirmed ? "Mapping confirmed" : loading ? "Confirming…" : "Confirm mapping"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-slate-300">{label}</span>
      {children}
    </label>
  );
}
