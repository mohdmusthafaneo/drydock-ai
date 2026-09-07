"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { GovernancePolicyConfig } from "@/lib/governance/policy";
import { cn } from "@/lib/utils";

const selectClass =
  "flex h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

const ESCALATION_LEVELS = [
  { value: "TEAM_LEAD", label: "Team lead" },
  { value: "DELIVERY_MANAGER", label: "Delivery manager" },
  { value: "ENGINEERING_MANAGER", label: "Engineering manager" },
  { value: "ORG_ADMIN", label: "Org admin" },
  { value: "EXECUTIVE", label: "Executive" },
] as const;

type PolicyFormState = {
  baseline: GovernancePolicyConfig;
  projectOverrides: Record<string, Partial<GovernancePolicyConfig>>;
};

type InheritFieldProps<T> = {
  label: string;
  hint?: string;
  inheritLabel: string;
  inheritedValue: string;
  defaultOverride: T;
  overrideValue: T | undefined;
  onOverride: (value: T | undefined) => void;
  children: (value: T, onChange: (value: T) => void) => React.ReactNode;
};

function InheritField<T>({
  label,
  hint,
  inheritLabel,
  inheritedValue,
  defaultOverride,
  overrideValue,
  onOverride,
  children,
}: InheritFieldProps<T>) {
  const isOverridden = overrideValue !== undefined;

  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="radio"
            checked={!isOverridden}
            onChange={() => onOverride(undefined)}
            className="accent-ink"
          />
          {inheritLabel} ({inheritedValue})
        </label>
        <label className="flex items-center gap-2 text-sm text-muted">
          <input
            type="radio"
            checked={isOverridden}
            onChange={() => onOverride(overrideValue ?? defaultOverride)}
            className="accent-ink"
          />
          Override
        </label>
      </div>
      {isOverridden && children(overrideValue as T, (v) => onOverride(v))}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </label>
  );
}

function BaselineFields({
  config,
  onChange,
}: {
  config: GovernancePolicyConfig;
  onChange: (config: GovernancePolicyConfig) => void;
}) {
  const deployment = config.deploymentThresholds ?? {};
  const releaseRules = config.releaseRules ?? {};
  const approval = config.approvalRequirements ?? {};
  const escalation = config.escalationChains ?? {};

  return (
    <div className="space-y-4">
      <Field label="Minimum readiness score" hint="QA readiness below this triggers a hold.">
        <input
          type="number"
          min={0}
          max={100}
          value={deployment.minReadinessScore ?? 70}
          onChange={(e) =>
            onChange({
              ...config,
              deploymentThresholds: {
                ...deployment,
                minReadinessScore: Number(e.target.value),
              },
            })
          }
          className={selectClass}
        />
      </Field>

      <Field label="Block on critical signals">
        <select
          value={deployment.blockOnCritical === false ? "false" : "true"}
          onChange={(e) =>
            onChange({
              ...config,
              deploymentThresholds: {
                ...deployment,
                blockOnCritical: e.target.value === "true",
              },
            })
          }
          className={selectClass}
        >
          <option value="true">Yes — hold on critical alerts</option>
          <option value="false">No — advisory only</option>
        </select>
      </Field>

      <Field label="Production approval required">
        <select
          value={releaseRules.requireApprovalForProduction === false ? "false" : "true"}
          onChange={(e) =>
            onChange({
              ...config,
              releaseRules: {
                ...releaseRules,
                requireApprovalForProduction: e.target.value === "true",
              },
            })
          }
          className={selectClass}
        >
          <option value="true">Yes — human sign-off required</option>
          <option value="false">No — auto-route when healthy</option>
        </select>
      </Field>

      <Field label="Minimum approvers">
        <input
          type="number"
          min={1}
          max={10}
          value={approval.minApprovers ?? 1}
          onChange={(e) =>
            onChange({
              ...config,
              approvalRequirements: {
                ...approval,
                minApprovers: Number(e.target.value),
              },
            })
          }
          className={selectClass}
        />
      </Field>

      <Field label="QA lead for high-risk releases">
        <select
          value={approval.qaLeadForHighRisk === false ? "false" : "true"}
          onChange={(e) =>
            onChange({
              ...config,
              approvalRequirements: {
                ...approval,
                qaLeadForHighRisk: e.target.value === "true",
              },
            })
          }
          className={selectClass}
        >
          <option value="true">Required for high/critical risk</option>
          <option value="false">Optional</option>
        </select>
      </Field>

      <Field label="Escalation chain" hint="Ordered roles when governance gates are breached.">
        <div className="space-y-2">
          {(escalation.levels ?? ["DELIVERY_MANAGER", "ORG_ADMIN"]).map((level, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-6 text-xs text-muted">{index + 1}.</span>
              <select
                value={level}
                onChange={(e) => {
                  const levels = [...(escalation.levels ?? ["DELIVERY_MANAGER", "ORG_ADMIN"])];
                  levels[index] = e.target.value;
                  onChange({
                    ...config,
                    escalationChains: { levels },
                  });
                }}
                className={selectClass}
              >
                {ESCALATION_LEVELS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              onChange({
                ...config,
                escalationChains: {
                  levels: [...(escalation.levels ?? []), "DELIVERY_MANAGER"],
                },
              })
            }
            className="text-[13px] font-medium text-ink hover:text-rust"
          >
            + Add escalation level
          </button>
        </div>
      </Field>
    </div>
  );
}

function ProjectOverrideCard({
  projectKey,
  baseline,
  override,
  onChange,
  onClear,
}: {
  projectKey: string;
  baseline: GovernancePolicyConfig;
  override: Partial<GovernancePolicyConfig>;
  onChange: (override: Partial<GovernancePolicyConfig>) => void;
  onClear: () => void;
}) {
  const hasOverrides = Object.keys(override).length > 0;
  const deployment = override.deploymentThresholds;
  const releaseRules = override.releaseRules;
  const approval = override.approvalRequirements;

  return (
    <Card className={cn(!hasOverrides && "border-dashed border-dove")}>
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">{projectKey}</CardTitle>
          {hasOverrides && (
            <button
              type="button"
              onClick={onClear}
              className="text-[13px] font-medium text-muted hover:text-rust"
            >
              Clear overrides
            </button>
          )}
        </div>
        <CardDescription>
          {hasOverrides
            ? "Custom governance rules for this project"
            : "Inherits organization baseline for all fields"}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <InheritField<number>
          label="Minimum readiness score"
          inheritLabel="Inherit"
          inheritedValue={String(baseline.deploymentThresholds?.minReadinessScore ?? 70)}
          defaultOverride={baseline.deploymentThresholds?.minReadinessScore ?? 70}
          overrideValue={deployment?.minReadinessScore}
          onOverride={(value) =>
            onChange({
              ...override,
              deploymentThresholds:
                value === undefined
                  ? stripField(override.deploymentThresholds, "minReadinessScore")
                  : { ...override.deploymentThresholds, minReadinessScore: value },
            })
          }
        >
          {(value, onValueChange) => (
            <input
              type="number"
              min={0}
              max={100}
              value={value}
              onChange={(e) => onValueChange(Number(e.target.value))}
              className={cn(selectClass, "mt-2")}
            />
          )}
        </InheritField>

        <InheritField<boolean>
          label="Block on critical signals"
          inheritLabel="Inherit"
          inheritedValue={
            baseline.deploymentThresholds?.blockOnCritical === false ? "No" : "Yes"
          }
          defaultOverride={baseline.deploymentThresholds?.blockOnCritical !== false}
          overrideValue={deployment?.blockOnCritical}
          onOverride={(value) =>
            onChange({
              ...override,
              deploymentThresholds:
                value === undefined
                  ? stripField(override.deploymentThresholds, "blockOnCritical")
                  : { ...override.deploymentThresholds, blockOnCritical: value },
            })
          }
        >
          {(value, onValueChange) => (
            <select
              value={value ? "true" : "false"}
              onChange={(e) => onValueChange(e.target.value === "true")}
              className={cn(selectClass, "mt-2")}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          )}
        </InheritField>

        <InheritField<boolean>
          label="Production approval required"
          inheritLabel="Inherit"
          inheritedValue={
            baseline.releaseRules?.requireApprovalForProduction === false ? "No" : "Yes"
          }
          defaultOverride={baseline.releaseRules?.requireApprovalForProduction !== false}
          overrideValue={releaseRules?.requireApprovalForProduction}
          onOverride={(value) =>
            onChange({
              ...override,
              releaseRules:
                value === undefined
                  ? stripField(override.releaseRules, "requireApprovalForProduction")
                  : { ...override.releaseRules, requireApprovalForProduction: value },
            })
          }
        >
          {(value, onValueChange) => (
            <select
              value={value ? "true" : "false"}
              onChange={(e) => onValueChange(e.target.value === "true")}
              className={cn(selectClass, "mt-2")}
            >
              <option value="true">Yes</option>
              <option value="false">No</option>
            </select>
          )}
        </InheritField>

        <InheritField<number>
          label="Minimum approvers"
          inheritLabel="Inherit"
          inheritedValue={String(baseline.approvalRequirements?.minApprovers ?? 1)}
          defaultOverride={baseline.approvalRequirements?.minApprovers ?? 1}
          overrideValue={approval?.minApprovers}
          onOverride={(value) =>
            onChange({
              ...override,
              approvalRequirements:
                value === undefined
                  ? stripField(override.approvalRequirements, "minApprovers")
                  : { ...override.approvalRequirements, minApprovers: value },
            })
          }
        >
          {(value, onValueChange) => (
            <input
              type="number"
              min={1}
              max={10}
              value={value}
              onChange={(e) => onValueChange(Number(e.target.value))}
              className={cn(selectClass, "mt-2")}
            />
          )}
        </InheritField>

        <InheritField<boolean>
          label="QA lead for high-risk"
          inheritLabel="Inherit"
          inheritedValue={baseline.approvalRequirements?.qaLeadForHighRisk === false ? "No" : "Yes"}
          defaultOverride={baseline.approvalRequirements?.qaLeadForHighRisk !== false}
          overrideValue={approval?.qaLeadForHighRisk}
          onOverride={(value) =>
            onChange({
              ...override,
              approvalRequirements:
                value === undefined
                  ? stripField(override.approvalRequirements, "qaLeadForHighRisk")
                  : { ...override.approvalRequirements, qaLeadForHighRisk: value },
            })
          }
        >
          {(value, onValueChange) => (
            <select
              value={value ? "true" : "false"}
              onChange={(e) => onValueChange(e.target.value === "true")}
              className={cn(selectClass, "mt-2")}
            >
              <option value="true">Required</option>
              <option value="false">Optional</option>
            </select>
          )}
        </InheritField>
      </CardContent>
    </Card>
  );
}

function stripField<T extends Record<string, unknown>, K extends keyof T>(
  obj: T | undefined,
  key: K,
): T | undefined {
  if (!obj) return undefined;
  const next = { ...obj };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

function pruneEmptyOverride(
  override: Partial<GovernancePolicyConfig>,
): Partial<GovernancePolicyConfig> | undefined {
  const next: Partial<GovernancePolicyConfig> = {};
  if (override.deploymentThresholds && Object.keys(override.deploymentThresholds).length > 0) {
    next.deploymentThresholds = override.deploymentThresholds;
  }
  if (override.releaseRules && Object.keys(override.releaseRules).length > 0) {
    next.releaseRules = override.releaseRules;
  }
  if (override.approvalRequirements && Object.keys(override.approvalRequirements).length > 0) {
    next.approvalRequirements = override.approvalRequirements;
  }
  if (override.escalationChains && Object.keys(override.escalationChains).length > 0) {
    next.escalationChains = override.escalationChains;
  }
  return Object.keys(next).length > 0 ? next : undefined;
}

export function GovernancePolicyForm({
  initialBaseline,
  initialProjectOverrides,
  projectKeys,
}: {
  initialBaseline: GovernancePolicyConfig;
  initialProjectOverrides: Record<string, Partial<GovernancePolicyConfig>>;
  projectKeys: string[];
}) {
  const router = useRouter();
  const [state, setState] = useState<PolicyFormState>({
    baseline: initialBaseline,
    projectOverrides: initialProjectOverrides,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setState({
      baseline: initialBaseline,
      projectOverrides: initialProjectOverrides,
    });
  }, [initialBaseline, initialProjectOverrides]);

  async function save() {
    setLoading(true);
    setError(null);

    const projectOverrides: Record<string, Partial<GovernancePolicyConfig>> = {};
    for (const [key, override] of Object.entries(state.projectOverrides)) {
      const pruned = pruneEmptyOverride(override);
      if (pruned) projectOverrides[key] = pruned;
    }

    const res = await fetch("/api/governance/policy", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        baseline: state.baseline,
        projectOverrides,
      }),
    });

    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Failed to save governance policy");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-6 pb-24 lg:pb-8">
      <Card>
        <CardHeader>
          <CardTitle>Organization baseline</CardTitle>
          <CardDescription>
            Default governance and compliance rules for all projects. Per-project cards below can
            override individual fields.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BaselineFields
            config={state.baseline}
            onChange={(baseline) => setState((s) => ({ ...s, baseline }))}
          />
        </CardContent>
      </Card>

      {projectKeys.length > 0 ? (
        <section className="space-y-4">
          <div>
            <h2 className="text-base font-medium text-ink">Per-project overrides</h2>
            <p className="mt-1 text-sm text-muted">
              Customize compliance and governance for synced Jira projects. Unset fields inherit the
              org baseline.
            </p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            {projectKeys.map((projectKey) => (
              <ProjectOverrideCard
                key={projectKey}
                projectKey={projectKey}
                baseline={state.baseline}
                override={state.projectOverrides[projectKey] ?? {}}
                onChange={(override) =>
                  setState((s) => ({
                    ...s,
                    projectOverrides: { ...s.projectOverrides, [projectKey]: override },
                  }))
                }
                onClear={() =>
                  setState((s) => {
                    const next = { ...s.projectOverrides };
                    delete next[projectKey];
                    return { ...s, projectOverrides: next };
                  })
                }
              />
            ))}
          </div>
        </section>
      ) : (
        <Card className="border-dashed border-dove">
          <CardContent className="py-8 text-center text-sm text-muted">
            <p>Connect Jira and select synced projects to configure per-project governance.</p>
            <Link
              href="/integrations"
              className="mt-2 inline-block font-medium text-ink hover:text-rust"
            >
              Go to Integrations →
            </Link>
          </CardContent>
        </Card>
      )}

      {error && <p className="text-sm text-error">{error}</p>}

      <div className="sticky bottom-0 -mx-4 border-t border-border-subtle bg-pure-white/95 px-4 py-4 backdrop-blur-sm lg:-mx-0 lg:rounded-[16px] lg:border lg:px-4">
        <div className="flex flex-wrap items-center justify-end gap-4">
          <Button onClick={() => save()} disabled={loading} variant="brown" size="lg">
            {loading ? "Saving…" : "Save governance policy"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-ink">{label}</span>
      {children}
      {hint && <p className="text-xs text-muted">{hint}</p>}
    </label>
  );
}
