"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { HygieneGradeChip } from "@/components/delivery-analysis/jira-hygiene-banner";
import type { JiraSchemaSnapshot } from "@/lib/jira-meta";
import type { JiraHygieneFinding, PortfolioJiraHygiene } from "@/lib/jira-hygiene";
import { JiraIssueLink } from "@/components/delivery-analysis/jira-issue-link";
import type { ToolchainMapping } from "@/lib/toolchain-mapping";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

const SEVERITY_ORDER: Record<JiraHygieneFinding["severity"], number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

type GitHubSchemaSnapshot = {
  syncedAt: string;
  repos: Array<{ fullName: string; defaultBranch: string; branches?: string[] }>;
  suggestions: {
    branchStrategy?: { value: string; reason: string };
    productionBranch?: { value: string; reason: string };
  };
};

type CalibrationSuggestion = {
  projectKey: string;
  status: string;
  confidence: string | null;
  calibratedAt: string | null;
  doneStatusNames: string[];
  blockedStatusName: string;
  releaseTracking: string;
  methodology: string;
  rationale: string | null;
  sampleCapped?: boolean;
  totalInWindow?: number;
};

type CalibrationProfileSummary = {
  projectKey: string;
  status: string;
  confidence: string | null;
  calibratedAt: string | null;
  source: string;
  sampleCapped?: boolean;
  totalInWindow?: number;
};

type SchemaState = {
  jira: JiraSchemaSnapshot | null;
  jiraStale: boolean;
  github: GitHubSchemaSnapshot | null;
};

function calibrationStatusLabel(status: string): string {
  switch (status) {
    case "calibrating":
      return "Calibrating…";
    case "calibrated":
      return "Calibrated";
    case "needs_review":
      return "Needs review";
    case "failed":
      return "Failed";
    default:
      return "Pending";
  }
}

function portfolioGrade(score: number): "good" | "fair" | "poor" {
  if (score >= 75) return "good";
  if (score >= 50) return "fair";
  return "poor";
}

function sortFindingsBySeverity(findings: JiraHygieneFinding[]): JiraHygieneFinding[] {
  return [...findings].sort(
    (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity],
  );
}

function findingCardClass(severity: JiraHygieneFinding["severity"]): string {
  const accent =
    severity === "critical"
      ? "border-l-error"
      : severity === "warning"
        ? "border-l-rust"
        : "border-l-dove";
  return cn("rounded-lg border border-border-subtle border-l-4 bg-pure-white", accent);
}

function findingValueClass(severity: JiraHygieneFinding["severity"]): string {
  switch (severity) {
    case "critical":
      return "text-error";
    case "warning":
      return "text-rust";
    default:
      return "text-ink";
  }
}

const METHODOLOGY_LABELS: Record<NonNullable<ToolchainMapping["jira"]>["methodology"], string> = {
  scrum: "Scrum (sprints)",
  kanban: "Kanban (flow)",
  mixed: "Mixed",
  custom: "Custom",
};

const RELEASE_TRACKING_LABELS: Record<
  NonNullable<ToolchainMapping["jira"]>["releaseTracking"],
  string
> = {
  fixVersion: "Fix versions",
  sprint: "Sprint milestones",
  labels: "Labels",
  none: "Not tracked in Jira",
};

const BRANCH_STRATEGY_LABELS: Record<
  NonNullable<ToolchainMapping["github"]>["branchStrategy"],
  string
> = {
  trunk: "Trunk-based (main)",
  gitflow: "GitFlow (main + develop)",
  "release-branches": "Release branches",
  custom: "Custom",
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
  const [editingConfig, setEditingConfig] = useState(!confirmed);
  const [schema, setSchema] = useState<SchemaState>({
    jira: null,
    jiraStale: false,
    github: null,
  });
  const [jiraHygiene, setJiraHygiene] = useState<PortfolioJiraHygiene | null>(null);
  const [jiraHygieneLinks, setJiraHygieneLinks] = useState<Record<string, string>>({});
  const [calibrationProfiles, setCalibrationProfiles] = useState<CalibrationProfileSummary[]>([]);
  const [calibrationSuggestions, setCalibrationSuggestions] = useState<CalibrationSuggestion[]>([]);
  const [recalibrating, setRecalibrating] = useState(false);
  const [recalibrateMessage, setRecalibrateMessage] = useState<string | null>(null);

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
      setJiraHygiene(data.jiraHygiene ?? null);
      setJiraHygieneLinks(data.jiraHygieneLinks ?? {});
      setCalibrationProfiles(data.calibrationProfiles ?? []);
      setCalibrationSuggestions(data.calibrationSuggestions ?? []);
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
    if (confirmed) setEditingConfig(false);
  }, [confirmed]);

  useEffect(() => {
    if (syncReady) void loadSchema();
  }, [syncReady, loadSchema]);

  async function handleRecalibrate(projectKey?: string) {
    setRecalibrating(true);
    setRecalibrateMessage(null);
    setError(null);
    try {
      const res = await fetch("/api/governance/jira/calibrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ projectKey, force: true }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) {
        setError(data.error ?? "Recalibration failed");
        return;
      }
      setRecalibrateMessage(
        projectKey
          ? `Recalibration started for ${projectKey}`
          : "Recalibration started for all synced projects",
      );
      await loadSchema();
      router.refresh();
    } catch {
      setError("Recalibration request failed");
    } finally {
      setRecalibrating(false);
    }
  }

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

      await loadSchema();
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
    if (confirm) setEditingConfig(false);
    router.refresh();
  }

  const jiraSchema = schema.jira;
  const githubSchema = schema.github;
  const confidence = mapping.inferredFrom?.suggestionConfidence;
  const doneStatuses = jiraSchema?.statuses.filter((s) => s.statusCategory.key === "done");
  const showConfigForm = !confirmed || editingConfig;
  const hasHygieneFindings =
    jiraHygiene &&
    Object.values(jiraHygiene.byProject).some((r) => r.findings.length > 0);

  if (!syncReady) {
    return (
      <Card className="border-dashed border-dove">
        <CardContent className="py-10 text-center text-ash">
          <p>
            Connect Jira or GitHub, select projects/repos, and run an initial sync before mapping
            your delivery toolchain.
          </p>
          <Link
            href="/integrations"
            className="mt-3 inline-block text-[15px] font-medium text-ink hover:text-rust"
          >
            Go to Integrations →
          </Link>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-4">
      {schema.jiraStale && (
        <div className="rounded-[16px] border border-warning/30 bg-warning-muted px-4 py-3 text-sm text-warning">
          Project selection changed or schema is older than 7 days — refresh schema before
          confirming.
        </div>
      )}

      {calibrationProfiles.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="text-base">90-day Jira calibration</CardTitle>
                <CardDescription>
                  Workflow semantics learned from recent Jira activity. Delivery scores stay
                  discounted until calibration completes.
                </CardDescription>
              </div>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={recalibrating}
                onClick={() => void handleRecalibrate()}
              >
                {recalibrating ? "Starting…" : "Recalibrate all"}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-3">
            {recalibrateMessage && (
              <p className="rounded-lg border border-chart-blue/30 bg-sky-wash px-3 py-2 text-sm text-chart-blue">
                {recalibrateMessage}
              </p>
            )}
            {calibrationProfiles.map((profile) => (
              <div
                key={profile.projectKey}
                className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border-subtle bg-pure-white px-3 py-2 text-sm"
              >
                <span className="font-medium text-ink">{profile.projectKey}</span>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="muted">{calibrationStatusLabel(profile.status)}</Badge>
                  {profile.confidence && (
                    <Badge variant="accent">{profile.confidence} confidence</Badge>
                  )}
                  {profile.sampleCapped && (
                    <Badge variant="muted" title="90-day sample capped at 500 issues">
                      500-issue cap
                    </Badge>
                  )}
                  {(profile.status === "failed" || profile.status === "calibrating") && (
                    <button
                      type="button"
                      onClick={() => void handleRecalibrate(profile.projectKey)}
                      disabled={recalibrating}
                      className="text-[13px] font-medium text-ink hover:text-rust disabled:opacity-50"
                    >
                      Retry
                    </button>
                  )}
                </div>
              </div>
            ))}
            {calibrationSuggestions.map((suggestion) => (
              <div
                key={`suggestion-${suggestion.projectKey}`}
                className="rounded-lg border border-border-subtle bg-surface-muted px-3 py-3 text-sm"
              >
                <p className="font-medium text-ink">
                  Suggested from 90-day history — {suggestion.projectKey}
                </p>
                {suggestion.sampleCapped && (
                  <p className="mt-1 text-xs text-warning">
                    Sample capped at 500 issues
                    {suggestion.totalInWindow != null
                      ? ` (${suggestion.totalInWindow} updated in window) — confidence reduced`
                      : " — confidence reduced"}
                  </p>
                )}
                <ul className="mt-2 space-y-1 text-muted">
                  <li>
                    Done statuses: {suggestion.doneStatusNames.join(", ") || "—"}
                  </li>
                  <li>Blocked status: {suggestion.blockedStatusName}</li>
                  <li>Release tracking: {suggestion.releaseTracking}</li>
                  <li>Methodology: {suggestion.methodology}</li>
                </ul>
                {suggestion.rationale && (
                  <p className="mt-2 text-ash">{suggestion.rationale}</p>
                )}
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {confidence === "low" && (
        <div className="rounded-[16px] border border-warning/30 bg-warning-muted px-4 py-3 text-sm text-warning">
          We could not confidently detect all Jira field semantics — review each mapping manually.
        </div>
      )}

      {jiraHygiene && confirmed && (
        <HygieneScorecard
          hygiene={jiraHygiene}
          onRefresh={refreshSchema}
          refreshing={refreshing}
        />
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Agreed workflow</CardTitle>
              <CardDescription>
                How your organization tracks work, releases, and code — the semantics AIDOS uses
                for governance intelligence.
              </CardDescription>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-3">
              {!confirmed && (
                <button
                  type="button"
                  onClick={() => refreshSchema()}
                  disabled={refreshing}
                  className="text-[15px] font-medium text-ink hover:text-rust disabled:opacity-50"
                >
                  {refreshing ? "Refreshing schema…" : "Refresh schema"}
                </button>
              )}
              {confirmed && !editingConfig && (
                <button
                  type="button"
                  onClick={() => setEditingConfig(true)}
                  className="text-[15px] font-medium text-ink hover:text-rust"
                >
                  Edit mapping
                </button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {confirmed && !editingConfig ? (
            <AgreedWorkflowSummary mapping={mapping} />
          ) : (
            <>
              <section className="space-y-4">
                <h3 className="text-sm font-[480] text-ink">Primary decisions</h3>
                {mapping.jira ? (
                  <div className="space-y-4">
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
                        className={selectClass}
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
                              releaseTracking: e.target.value as
                                | "fixVersion"
                                | "sprint"
                                | "labels"
                                | "none",
                            },
                          }))
                        }
                        className={selectClass}
                      >
                        <option value="fixVersion">Fix versions</option>
                        <option value="sprint">Sprint milestones</option>
                        <option value="labels">Labels</option>
                        <option value="none">Not tracked in Jira</option>
                      </select>
                    </Field>
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    Connect and sync Jira to infer workflow defaults.{" "}
                    <Link href="/integrations" className="font-medium text-ink hover:text-rust">
                      Integrations
                    </Link>
                  </p>
                )}

                {mapping.github && (
                  <div className="space-y-4 border-t border-border-subtle pt-4">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted">
                      GitHub
                    </p>
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
                        className={selectClass}
                      >
                        <option value="trunk">Trunk-based (main)</option>
                        <option value="gitflow">GitFlow (main + develop)</option>
                        <option value="release-branches">Release branches</option>
                        <option value="custom">Custom</option>
                      </select>
                    </Field>
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
                          className={selectClass}
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
                          className={selectClass}
                        />
                      )}
                    </Field>
                  </div>
                )}
              </section>

              {mapping.jira && (
                <section className="space-y-4 border-t border-border-subtle pt-4">
                  <h3 className="text-sm font-[480] text-muted">Advanced / optional</h3>
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
                        className={selectClass}
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
                        className={selectClass}
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
                        className={selectClass}
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
                        className={selectClass}
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
                        className={selectClass}
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
                        className={selectClass}
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
                    <div className="rounded-[16px] border border-border-subtle bg-fog px-3 py-2 text-xs text-muted">
                      <span className="font-medium text-ink">Done statuses detected: </span>
                      {[...new Set(doneStatuses.map((s) => s.name))].join(", ")}
                    </div>
                  )}
                </section>
              )}

              {mapping.github && mapping.github.branchStrategy !== "trunk" && (
                <section className="space-y-4 border-t border-border-subtle pt-4">
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
                      className={selectClass}
                    />
                  </Field>
                </section>
              )}

              {!mapping.github && !mapping.jira && (
                <p className="text-sm text-muted">
                  Connect and sync GitHub to infer branch and PR patterns.
                </p>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {jiraHygiene && confirmed && (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-medium text-ink">Actual usage</h2>
            <p className="mt-1 text-sm text-muted">
              How Jira boards are maintained compared to the agreed workflow above.
            </p>
          </div>
          {!hasHygieneFindings ? (
            <p className="text-sm text-muted">No hygiene issues detected at last sync.</p>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(jiraHygiene.byProject).map(([projectKey, result]) => {
                if (result.findings.length === 0) return null;
                const sorted = sortFindingsBySeverity(result.findings);
                return (
                  <Card key={projectKey}>
                    <CardHeader className="pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle className="text-base">{projectKey}</CardTitle>
                        <span className="text-sm tabular-nums text-muted">{result.score}/100</span>
                        <HygieneGradeChip grade={result.grade} />
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-2 pt-0">
                      {sorted.map((finding) => (
                        <div
                          key={`${projectKey}-${finding.id}`}
                          className={cn("px-3 py-2.5 text-sm", findingCardClass(finding.severity))}
                        >
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <p className="font-medium text-ink">{finding.label}</p>
                            <Badge
                              variant={
                                finding.severity === "critical"
                                  ? "error"
                                  : finding.severity === "warning"
                                    ? "warning"
                                    : "muted"
                              }
                              className="text-[10px] uppercase"
                            >
                              {finding.severity}
                            </Badge>
                          </div>
                          <p
                            className={cn(
                              "mt-1 text-[15px] font-[480] tabular-nums",
                              findingValueClass(finding.severity),
                            )}
                          >
                            {finding.value}
                          </p>
                          <p className="mt-1 text-xs text-muted">{finding.recommendation}</p>
                          <JiraIssueLink href={jiraHygieneLinks[`${projectKey}:${finding.id}`]} />
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </section>
      )}

      {mapping.inferredFrom && showConfigForm && (
        <p className="text-xs text-muted">
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
        <p className="text-sm text-error">
          {error}
          {(error.includes("scope") || error.includes("OAuth")) && (
            <>
              {" "}
              <Link href="/integrations" className="font-medium text-ink hover:text-rust">
                Reconnect Jira
              </Link>
            </>
          )}
        </p>
      )}

      <div className="sticky bottom-0 -mx-4 border-t border-border-subtle bg-pure-white/95 px-4 py-4 backdrop-blur-sm lg:-mx-0 lg:rounded-[16px] lg:border lg:px-4">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <button
            type="button"
            onClick={() => save(false)}
            disabled={loading}
            className="text-[15px] font-medium text-ink hover:text-rust disabled:opacity-50"
          >
            Save draft
          </button>
          <Button onClick={() => save(true)} disabled={loading || confirmed} variant="ink" size="lg">
            {confirmed ? "Mapping confirmed" : loading ? "Confirming…" : "Confirm mapping"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function HygieneScorecard({
  hygiene,
  onRefresh,
  refreshing,
}: {
  hygiene: PortfolioJiraHygiene;
  onRefresh: () => void;
  refreshing: boolean;
}) {
  const grade = portfolioGrade(hygiene.portfolioScore);

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-3">
          <p className="text-sm font-medium text-ash">Agreed workflow hygiene</p>
          <div className="flex flex-wrap items-end gap-3">
            <p className="text-[48px] font-[480] leading-none tabular-nums tracking-[-0.02em] text-ink">
              {hygiene.portfolioScore}
              <span className="text-[22px] font-normal text-muted">/100</span>
            </p>
            <HygieneGradeChip grade={grade} />
          </div>
          <p className="max-w-md text-[15px] leading-relaxed text-ink">
            {hygiene.degradesTrust
              ? "Low confidence — boards not maintained per agreed workflow."
              : "Governance signals are trustworthy."}
          </p>
          {hygiene.worstProject && (
            <p className="text-sm text-muted">
              Weakest project:{" "}
              <span className="font-medium text-ink">
                {hygiene.worstProject.key}
              </span>{" "}
              <span className="tabular-nums">({hygiene.worstProject.score}/100)</span>
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={refreshing}
          className="shrink-0 text-[15px] font-medium text-ink hover:text-rust disabled:opacity-50"
        >
          {refreshing ? "Refreshing schema…" : "Refresh schema"}
        </button>
      </div>
      </CardContent>
    </Card>
  );
}

function AgreedWorkflowSummary({ mapping }: { mapping: ToolchainMapping }) {
  return (
    <div className="divide-y divide-border-subtle rounded-[16px] border border-border-subtle">
      {mapping.jira && (
        <div className="space-y-0 px-4 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">Jira</p>
          <SummaryRow label="Methodology" value={METHODOLOGY_LABELS[mapping.jira.methodology]} />
          <SummaryRow
            label="Release tracking"
            value={RELEASE_TRACKING_LABELS[mapping.jira.releaseTracking]}
          />
          {mapping.jira.releaseTracking === "labels" && mapping.jira.releaseLabelPrefix && (
            <SummaryRow label="Release label prefix" value={mapping.jira.releaseLabelPrefix} />
          )}
          <SummaryRow label="Blocked status" value={mapping.jira.blockedStatusName} />
          <SummaryRow label="Bug issue type" value={mapping.jira.bugIssueType} />
          {mapping.jira.storyPointField && (
            <SummaryRow label="Story points" value={mapping.jira.storyPointField.name} />
          )}
        </div>
      )}
      {mapping.github && (
        <div className="space-y-0 px-4 py-3">
          <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">GitHub</p>
          <SummaryRow
            label="Branch strategy"
            value={BRANCH_STRATEGY_LABELS[mapping.github.branchStrategy]}
          />
          <SummaryRow
            label="Default branch"
            value={mapping.github.primaryDefaultBranch}
          />
          {mapping.github.productionBranch && (
            <SummaryRow label="Production branch" value={mapping.github.productionBranch} />
          )}
        </div>
      )}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <span className="text-sm text-muted">{label}</span>
      <span className="text-right text-sm font-medium text-ink">{value}</span>
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
      <span className="flex items-center gap-2 text-sm font-medium text-ink">
        {label}
        {confidence != null && (
          <Badge
            variant={
              confidence >= 0.8 ? "success" : confidence >= 0.5 ? "warning" : "error"
            }
            className="px-1.5 py-0 text-[10px] font-normal"
          >
            {confidence >= 0.8 ? "high" : confidence >= 0.5 ? "medium" : "low"}
          </Badge>
        )}
      </span>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </label>
  );
}
