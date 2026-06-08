"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { JiraSchemaSnapshot } from "@/lib/jira-meta";
import type { ToolchainMapping } from "@/lib/toolchain-mapping";

type GitHubSchemaSnapshot = {
  syncedAt: string;
  repos: Array<{ fullName: string; defaultBranch: string; branches?: string[] }>;
  suggestions: {
    branchStrategy?: { value: string; reason: string };
    productionBranch?: { value: string; reason: string };
  };
};

type SchemaState = {
  jira: JiraSchemaSnapshot | null;
  jiraStale: boolean;
  github: GitHubSchemaSnapshot | null;
};

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
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [schema, setSchema] = useState<SchemaState>({
    jira: null,
    jiraStale: false,
    github: null,
  });

  const loadSchema = useCallback(async () => {
    const [mappingRes, jiraRes, githubRes] = await Promise.all([
      fetch("/api/governance/toolchain-mapping", { credentials: "same-origin" }),
      fetch("/api/integrations/jira/introspect", { credentials: "same-origin" }),
      fetch("/api/integrations/github/introspect", { credentials: "same-origin" }),
    ]);

    if (mappingRes.ok) {
      const data = await mappingRes.json();
      setSchema({
        jira: data.jiraSchema ?? null,
        jiraStale: data.jiraSchemaStale ?? false,
        github: data.githubSchema ?? null,
      });
    }

    if (jiraRes.ok) {
      const data = await jiraRes.json();
      setSchema((s) => ({
        ...s,
        jira: data.snapshot ?? s.jira,
        jiraStale: data.stale ?? s.jiraStale,
      }));
    }

    if (githubRes.ok) {
      const data = await githubRes.json();
      setSchema((s) => ({ ...s, github: data.snapshot ?? s.github }));
    }
  }, []);

  useEffect(() => {
    setMapping(initialMapping);
  }, [initialMapping]);

  useEffect(() => {
    if (syncReady) void loadSchema();
  }, [syncReady, loadSchema]);

  async function refreshSchema() {
    setRefreshing(true);
    setError(null);
    try {
      const [jiraRes, githubRes] = await Promise.all([
        fetch("/api/integrations/jira/introspect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ force: true }),
        }),
        fetch("/api/integrations/github/introspect", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ force: true }),
        }),
      ]);

      if (!jiraRes.ok && jiraRes.status !== 400) {
        const data = await jiraRes.json();
        if (jiraRes.status === 401 || jiraRes.status === 403) {
          setError(
            data.error ??
              "Jira OAuth scopes may be insufficient. Disconnect and reconnect Jira on Integrations.",
          );
        } else if (jiraRes.status !== 429) {
          setError(data.error || "Failed to refresh Jira schema");
        }
      }

      if (jiraRes.ok) {
        const data = await jiraRes.json();
        setSchema((s) => ({
          ...s,
          jira: data.snapshot ?? s.jira,
          jiraStale: false,
        }));
        if (data.mappingSuggestions) {
          setMapping((m) => ({
            ...m,
            jira: data.mappingSuggestions.jira ?? m.jira,
            github: data.mappingSuggestions.github ?? m.github,
            inferredFrom: data.mappingSuggestions.inferredFrom ?? m.inferredFrom,
          }));
        }
      }

      if (githubRes.ok) {
        const data = await githubRes.json();
        setSchema((s) => ({ ...s, github: data.snapshot ?? s.github }));
        if (data.mappingSuggestions?.github) {
          setMapping((m) => ({
            ...m,
            github: data.mappingSuggestions.github ?? m.github,
          }));
        }
      }

      router.refresh();
    } finally {
      setRefreshing(false);
    }
  }

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

  const jiraSchema = schema.jira;
  const githubSchema = schema.github;
  const confidence = mapping.inferredFrom?.suggestionConfidence;
  const doneStatuses = jiraSchema?.statuses.filter(
    (s) => s.statusCategory.key === "done",
  );

  if (!syncReady) {
    return (
      <Card className="border-dashed border-[#4F8CFF]/30">
        <CardContent className="py-10 text-center text-slate-400">
          <p>
            Connect Jira or GitHub, select projects/repos, and run an initial sync before mapping
            your delivery toolchain.
          </p>
          <Link href="/integrations" className="mt-3 inline-block text-sm text-[#93b4ff] hover:underline">
            Go to Integrations →
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {schema.jiraStale && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          Project selection changed or schema is older than 7 days — refresh schema before
          confirming.
        </div>
      )}

      {confidence === "low" && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          We could not confidently detect all Jira field semantics — review each mapping manually.
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Button variant="secondary" onClick={() => refreshSchema()} disabled={refreshing}>
          {refreshing ? "Refreshing schema…" : "Refresh schema"}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Jira workflow semantics</CardTitle>
          <CardDescription>
            {jiraSchema
              ? "Populated from your Jira project schema. Adjust if your team uses different names."
              : "Inferred from synced projects. Refresh schema for API-backed field picks."}
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
              <Field
                label="Release tracking"
                hint={jiraSchema?.suggestions.releaseTracking?.reason}
              >
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
              {mapping.jira.releaseTracking === "labels" && (
                <Field label="Release label prefix">
                  <input
                    value={mapping.jira.releaseLabelPrefix ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        jira: { ...m.jira!, releaseLabelPrefix: e.target.value },
                      }))
                    }
                    placeholder="release-"
                    className="w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
                  />
                </Field>
              )}
              <Field
                label="Blocked status"
                hint={jiraSchema?.suggestions.blockedStatus?.reason}
                confidence={jiraSchema?.suggestions.blockedStatus?.confidence}
              >
                {jiraSchema && jiraSchema.statuses.length > 0 ? (
                  <select
                    value={mapping.jira.blockedStatusName}
                    onChange={(e) => {
                      const status = jiraSchema.statuses.find((s) => s.name === e.target.value);
                      setMapping((m) => ({
                        ...m,
                        jira: {
                          ...m.jira!,
                          blockedStatusName: e.target.value,
                          blockedStatusId: status?.id,
                        },
                      }));
                    }}
                    className="w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
                  >
                    {jiraSchema.statuses.map((s) => (
                      <option key={`${s.id}-${s.scope?.projectKey ?? ""}`} value={s.name}>
                        {s.name}
                        {s.scope?.projectKey ? ` (${s.scope.projectKey})` : ""}
                      </option>
                    ))}
                  </select>
                ) : (
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
                )}
              </Field>
              <Field
                label="Bug issue type"
                hint={jiraSchema?.suggestions.bugIssueType?.reason}
                confidence={jiraSchema?.suggestions.bugIssueType?.confidence}
              >
                {jiraSchema && jiraSchema.issueTypes.length > 0 ? (
                  <select
                    value={mapping.jira.bugIssueType}
                    onChange={(e) => {
                      const t = jiraSchema.issueTypes.find((it) => it.name === e.target.value);
                      setMapping((m) => ({
                        ...m,
                        jira: {
                          ...m.jira!,
                          bugIssueType: e.target.value,
                          bugIssueTypeId: t?.id,
                        },
                      }));
                    }}
                    className="w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
                  >
                    {jiraSchema.issueTypes
                      .filter((t) => !t.subtask)
                      .map((t) => (
                        <option key={t.id} value={t.name}>
                          {t.name}
                        </option>
                      ))}
                  </select>
                ) : (
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
                )}
              </Field>
              {jiraSchema && jiraSchema.fields.length > 0 && (
                <Field
                  label="Story point field (optional)"
                  hint={jiraSchema.suggestions.storyPointField?.reason}
                >
                  <select
                    value={mapping.jira.storyPointField?.id ?? ""}
                    onChange={(e) => {
                      const f = jiraSchema.fields.find((field) => field.id === e.target.value);
                      setMapping((m) => ({
                        ...m,
                        jira: {
                          ...m.jira!,
                          storyPointField: f
                            ? { id: f.id, name: f.name, schemaType: f.schema?.type }
                            : undefined,
                        },
                      }));
                    }}
                    className="w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
                  >
                    <option value="">Not used</option>
                    {jiraSchema.fields.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </Field>
              )}
              {doneStatuses && doneStatuses.length > 0 && (
                <div className="rounded-lg border border-white/5 bg-white/5 px-3 py-2 text-xs text-slate-400">
                  <span className="font-medium text-slate-300">Done statuses detected: </span>
                  {[...new Set(doneStatuses.map((s) => s.name))].join(", ")}
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500">
              Connect and sync Jira to infer workflow defaults.{" "}
              <Link href="/integrations" className="text-[#93b4ff] hover:underline">
                Integrations
              </Link>
            </p>
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
              <Field
                label="Primary default branch"
                hint={githubSchema?.suggestions.productionBranch?.reason}
              >
                {githubSchema && githubSchema.repos.length > 0 ? (
                  <select
                    value={mapping.github.primaryDefaultBranch}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        github: { ...m.github!, primaryDefaultBranch: e.target.value },
                      }))
                    }
                    className="w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
                  >
                    {[
                      ...new Set(
                        githubSchema.repos.flatMap((r) => [
                          r.defaultBranch,
                          ...(r.branches ?? []),
                        ]),
                      ),
                    ].map((b) => (
                      <option key={b} value={b}>
                        {b}
                      </option>
                    ))}
                  </select>
                ) : (
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
                )}
              </Field>
              <Field
                label="Branch strategy"
                hint={githubSchema?.suggestions.branchStrategy?.reason}
              >
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
              {mapping.github.branchStrategy !== "trunk" && (
                <Field label="Production / analysis branch">
                  <input
                    value={mapping.github.productionBranch ?? ""}
                    onChange={(e) =>
                      setMapping((m) => ({
                        ...m,
                        github: { ...m.github!, productionBranch: e.target.value || undefined },
                      }))
                    }
                    placeholder="main or develop"
                    className="w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
                  />
                </Field>
              )}
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
          {mapping.inferredFrom.jiraSchemaSyncedAt
            ? ` · Schema ${mapping.inferredFrom.jiraSchemaSyncedAt}`
            : ""}
          {confidence ? ` · Confidence: ${confidence}` : ""}
        </p>
      )}

      {error && (
        <p className="text-sm text-red-400">
          {error}
          {(error.includes("scope") || error.includes("OAuth")) && (
            <>
              {" "}
              <Link href="/integrations" className="text-[#93b4ff] hover:underline">
                Reconnect Jira
              </Link>
            </>
          )}
        </p>
      )}

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

function Field({
  label,
  hint,
  confidence,
  children,
}: {
  label: string;
  hint?: string;
  confidence?: number;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center gap-2 text-sm font-medium text-slate-300">
        {label}
        {confidence != null && (
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-normal ${
              confidence >= 0.8
                ? "bg-emerald-500/20 text-emerald-300"
                : confidence >= 0.5
                  ? "bg-amber-500/20 text-amber-300"
                  : "bg-red-500/20 text-red-300"
            }`}
          >
            {confidence >= 0.8 ? "high" : confidence >= 0.5 ? "medium" : "low"}
          </span>
        )}
      </span>
      {children}
      {hint && <p className="text-xs text-slate-500">{hint}</p>}
    </label>
  );
}
