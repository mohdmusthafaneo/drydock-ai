"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { generateDeliveryDNA } from "@/lib/delivery-dna";
import {
  approvalLevelLabel,
  autonomyModeLabel,
  governanceScoreBand,
  workflowModeLabel,
} from "@/lib/governance/presentation";
import { cn } from "@/lib/utils";

const TOOLS = [
  { id: "github", label: "GitHub", href: "/integrations?focus=github" },
  { id: "jira", label: "Jira", href: "/integrations?focus=jira" },
  { id: "grafana", label: "Grafana", href: "/integrations?focus=grafana" },
  { id: "prometheus", label: "Prometheus", href: "/integrations?focus=prometheus" },
  { id: "kubernetes", label: "Kubernetes", href: "/integrations" },
  { id: "slack", label: "Slack", href: "/integrations?focus=slack" },
  { id: "jenkins", label: "Jenkins", href: "/integrations?focus=jenkins" },
];

const WORKFLOWS = [
  { id: "scrum", label: "Scrum" },
  { id: "kanban", label: "Kanban" },
  { id: "safe", label: "SAFe" },
  { id: "devops", label: "DevOps pipeline" },
  { id: "gitflow", label: "GitFlow" },
];

const STEPS = ["Organization", "Governance", "Review"];

const DEFAULT_FORM = {
  industryType: "technology",
  teamSize: "11-50",
  sdlcMaturity: 3,
  devopsMaturity: 3,
  governanceLevel: 3,
  complianceType: "none",
  deploymentStrategy: "continuous",
  tools: ["github", "jira"] as string[],
  workflows: ["scrum", "devops"] as string[],
};

export type DiscoveryFormState = typeof DEFAULT_FORM;

const selectClass =
  "flex h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export function DiscoveryWizard({
  embedded = false,
  organizationName = "Your organization",
  initialForm,
}: {
  embedded?: boolean;
  organizationName?: string;
  initialForm?: DiscoveryFormState;
}) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<DiscoveryFormState>({
    ...DEFAULT_FORM,
    ...initialForm,
  });

  const previewDna = useMemo(
    () =>
      generateDeliveryDNA({
        organizationName,
        industryType: form.industryType,
        teamSize: form.teamSize,
        sdlcMaturity: form.sdlcMaturity,
        devopsMaturity: form.devopsMaturity,
        governanceLevel: form.governanceLevel,
        complianceType: form.complianceType,
        deploymentStrategy: form.deploymentStrategy,
        tools: form.tools,
        workflows: form.workflows,
      }),
    [form, organizationName],
  );

  const previewBand = governanceScoreBand(previewDna.governanceScore);

  function toggleItem(key: "tools" | "workflows", id: string) {
    setForm((prev) => {
      const list = prev[key];
      return {
        ...prev,
        [key]: list.includes(id) ? list.filter((x) => x !== id) : [...list, id],
      };
    });
  }

  async function submit() {
    setLoading(true);
    setError(null);
    const res = await fetch("/api/discovery", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Failed to complete discovery");
      return;
    }
    router.push(data.redirect || "/integrations?from=dna");
    router.refresh();
  }

  return (
    <div className={cn("space-y-6", !embedded && "mx-auto max-w-3xl")}>
      {!embedded && (
        <div>
          <h1 className="font-display text-[44px] leading-[1.1] tracking-[-0.66px] text-ink">
            Discovery & Delivery DNA
          </h1>
          <p className="mt-2 text-[16px] text-ash">
            Capture your delivery context to generate Delivery DNA and AI recommendations.
          </p>
        </div>
      )}

      <div className="flex gap-2 overflow-x-auto">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={cn(
              "min-w-[4.5rem] flex-1 rounded-[16px] border px-2 py-2 text-center text-xs font-medium",
              i <= step
                ? "border-rust/30 bg-apricot-wash text-ink"
                : "border-border-subtle bg-fog text-muted",
            )}
          >
            {label}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-[26px] leading-[1.18] tracking-[-0.23px] text-ink">
            {STEPS[step]}
          </CardTitle>
          <CardDescription>
            Step {step + 1} of {STEPS.length}
            {initialForm && step === 0 ? " · pre-filled from your profile" : ""}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label>Industry</Label>
                <select
                  className={selectClass}
                  value={form.industryType}
                  onChange={(e) => setForm({ ...form, industryType: e.target.value })}
                >
                  <option value="technology">Technology</option>
                  <option value="finance">Finance</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="retail">Retail</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Team size</Label>
                <select
                  className={selectClass}
                  value={form.teamSize}
                  onChange={(e) => setForm({ ...form, teamSize: e.target.value })}
                >
                  <option value="1-10">1–10</option>
                  <option value="11-50">11–50</option>
                  <option value="51-200">51–200</option>
                  <option value="200+">200+</option>
                </select>
              </div>
            </>
          )}

          {step === 1 && (
            <>
              <div className="space-y-2">
                <Label>Compliance</Label>
                <select
                  className={selectClass}
                  value={form.complianceType}
                  onChange={(e) => setForm({ ...form, complianceType: e.target.value })}
                >
                  <option value="none">None</option>
                  <option value="soc2">SOC 2</option>
                  <option value="hipaa">HIPAA</option>
                  <option value="pci">PCI</option>
                  <option value="iso27001">ISO 27001</option>
                </select>
              </div>
              <div className="space-y-2">
                <Label>Deployment strategy</Label>
                <select
                  className={selectClass}
                  value={form.deploymentStrategy}
                  onChange={(e) =>
                    setForm({ ...form, deploymentStrategy: e.target.value })
                  }
                >
                  <option value="continuous">Continuous deployment</option>
                  <option value="scheduled">Scheduled releases</option>
                  <option value="manual">Manual approval gates</option>
                </select>
              </div>
            </>
          )}

          {step === 2 && (
            <div className="space-y-5">
              <p className="text-[14px] leading-relaxed text-ash">
                Review your Delivery DNA before generating. This sets approval depth, autonomy
                mode, and governance recommendations.
              </p>

              <div className="rounded-[24px] border border-border-subtle bg-apricot-wash/40 p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
                      Governance score
                    </p>
                    <p className="mt-1 font-display text-[44px] leading-none tracking-[-0.66px] text-ink">
                      {previewDna.governanceScore}
                      <span className="text-[20px] text-graphite">/100</span>
                    </p>
                    <p className="mt-1 text-[13px] text-ash">{previewBand.bandLabel}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] font-medium uppercase tracking-[0.06em] text-graphite">
                      Autonomy
                    </p>
                    <p className="mt-1 font-medium text-ink">
                      {autonomyModeLabel(previewDna.autonomyMode)}
                    </p>
                    <p className="mt-1 text-[13px] text-graphite">
                      {approvalLevelLabel(previewDna.approvalLevel)}
                    </p>
                  </div>
                </div>
              </div>

              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Workflow mode</dt>
                  <dd className="mt-0.5 font-medium text-ink">
                    {workflowModeLabel(previewDna.workflowMode)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted">Risk threshold</dt>
                  <dd className="mt-0.5 font-medium text-ink">
                    {(previewDna.riskThreshold * 100).toFixed(0)}%
                  </dd>
                </div>
              </dl>

              <div className="rounded-[16px] bg-fog px-4 py-3 text-[14px] leading-relaxed text-ash">
                {previewDna.summary}
              </div>

              <div className="rounded-[16px] border border-border-subtle px-4 py-3">
                <p className="text-[13px] font-medium text-ink">You&apos;ll connect these next</p>
                <p className="mt-1 text-[13px] leading-relaxed text-ash">
                  Chips deep-link to Integrations — they do not authorize access by themselves.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {TOOLS.filter((t) => form.tools.includes(t.id)).map((tool) => (
                    <Link
                      key={tool.id}
                      href={tool.href}
                      className="rounded-full border border-chart-blue/40 bg-sky-wash px-3 py-1 text-sm text-ink transition-colors hover:border-chart-blue/60"
                    >
                      {tool.label}
                    </Link>
                  ))}
                  {form.tools.length === 0 && (
                    <Link
                      href="/integrations?from=dna"
                      className="text-[13px] font-medium text-ink underline-offset-4 hover:underline"
                    >
                      Open Integrations
                    </Link>
                  )}
                </div>
              </div>

              <details className="rounded-[16px] border border-border-subtle bg-fog/60 p-4">
                <summary className="cursor-pointer text-sm font-medium text-ink hover:text-rust">
                  Advanced — maturity, tools & workflows
                </summary>
                <div className="mt-4 space-y-5">
                  {(
                    [
                      ["sdlcMaturity", "SDLC maturity"],
                      ["devopsMaturity", "DevOps maturity"],
                      ["governanceLevel", "Governance maturity"],
                    ] as const
                  ).map(([key, label]) => (
                    <div key={key} className="space-y-2">
                      <Label>
                        {label}: {form[key]}/5
                      </Label>
                      <input
                        type="range"
                        min={1}
                        max={5}
                        value={form[key]}
                        onChange={(e) =>
                          setForm({ ...form, [key]: Number(e.target.value) })
                        }
                        className="w-full accent-rust"
                      />
                    </div>
                  ))}

                  <div>
                    <Label className="mb-2 block">Tooling ecosystem (intent only)</Label>
                    <div className="flex flex-wrap gap-2">
                      {TOOLS.map((tool) => (
                        <button
                          key={tool.id}
                          type="button"
                          onClick={() => toggleItem("tools", tool.id)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-sm transition-colors",
                            form.tools.includes(tool.id)
                              ? "border-chart-blue/40 bg-sky-wash text-ink"
                              : "border-border-subtle text-muted hover:bg-hover hover:text-ink",
                          )}
                        >
                          {tool.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <Label className="mb-2 block">Workflows</Label>
                    <div className="flex flex-wrap gap-2">
                      {WORKFLOWS.map((wf) => (
                        <button
                          key={wf.id}
                          type="button"
                          onClick={() => toggleItem("workflows", wf.id)}
                          className={cn(
                            "rounded-full border px-3 py-1 text-sm transition-colors",
                            form.workflows.includes(wf.id)
                              ? "border-rust/30 bg-apricot-wash text-ink"
                              : "border-border-subtle text-muted hover:bg-hover hover:text-ink",
                          )}
                        >
                          {wf.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            </div>
          )}

          {error && <p className="text-sm text-error">{error}</p>}

          <div className="flex items-center justify-between pt-2">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => setStep((s) => s - 1)}
                className="text-[15px] font-medium text-ink hover:text-rust"
              >
                Back
              </button>
            ) : (
              <span />
            )}
            {step < STEPS.length - 1 ? (
              <Button type="button" variant="ink" size="lg" onClick={() => setStep((s) => s + 1)}>
                Continue
              </Button>
            ) : (
              <Button type="button" variant="ink" size="lg" disabled={loading} onClick={submit}>
                {loading ? "Generating DNA…" : "Generate Delivery DNA"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
