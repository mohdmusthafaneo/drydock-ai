"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const TOOLS = [
  { id: "github", label: "GitHub" },
  { id: "jira", label: "Jira" },
  { id: "grafana", label: "Grafana" },
  { id: "prometheus", label: "Prometheus" },
  { id: "kubernetes", label: "Kubernetes" },
  { id: "slack", label: "Slack" },
  { id: "jenkins", label: "Jenkins" },
];

const WORKFLOWS = [
  { id: "scrum", label: "Scrum" },
  { id: "kanban", label: "Kanban" },
  { id: "safe", label: "SAFe" },
  { id: "devops", label: "DevOps pipeline" },
  { id: "gitflow", label: "GitFlow" },
];

const STEPS = ["Organization", "Maturity", "Tools & workflows", "Governance"];

export function DiscoveryWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    industryType: "technology",
    teamSize: "11-50",
    sdlcMaturity: 3,
    devopsMaturity: 3,
    governanceLevel: 3,
    complianceType: "none",
    deploymentStrategy: "continuous",
    tools: ["github", "jira"] as string[],
    workflows: ["scrum", "devops"] as string[],
  });

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
    router.push(data.redirect || "/workflow");
    router.refresh();
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Organization discovery</h1>
        <p className="mt-1 text-secondary">
          Capture your delivery context to generate Delivery DNA and AI recommendations.
        </p>
      </div>

      <div className="flex gap-2">
        {STEPS.map((label, i) => (
          <div
            key={label}
            className={cn(
              "flex-1 rounded-lg border px-3 py-2 text-center text-xs",
              i <= step
                ? "border-accent/40 bg-accent/10 text-accent"
                : "border-border text-muted",
            )}
          >
            {label}
          </div>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>{STEPS[step]}</CardTitle>
          <CardDescription>Step {step + 1} of {STEPS.length}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              <div className="space-y-2">
                <Label>Industry</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-primary"
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
                  className="flex h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-primary"
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
                    className="w-full accent-enterprise"
                  />
                </div>
              ))}
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <Label className="mb-2 block">Tooling ecosystem</Label>
                <div className="flex flex-wrap gap-2">
                  {TOOLS.map((tool) => (
                    <button
                      key={tool.id}
                      type="button"
                      onClick={() => toggleItem("tools", tool.id)}
                      className={cn(
                        "rounded-full border px-3 py-1 text-sm transition-colors",
                        form.tools.includes(tool.id)
                          ? "border-enterprise bg-enterprise-muted text-accent"
                          : "border-border text-secondary hover:border-border",
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
                          ? "border-[#8B5CF6] bg-[#8B5CF6]/15 text-[#c4b5fd]"
                          : "border-border text-secondary hover:border-border",
                      )}
                    >
                      {wf.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className="space-y-2">
                <Label>Compliance</Label>
                <select
                  className="flex h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-primary"
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
                  className="flex h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-primary"
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

          {error && (
            <p className="text-sm text-[#fca5a5]">{error}</p>
          )}

          <div className="flex justify-between pt-2">
            <Button
              type="button"
              variant="secondary"
              disabled={step === 0}
              onClick={() => setStep((s) => s - 1)}
            >
              Back
            </Button>
            {step < STEPS.length - 1 ? (
              <Button type="button" onClick={() => setStep((s) => s + 1)}>
                Continue
              </Button>
            ) : (
              <Button type="button" variant="ai" disabled={loading} onClick={submit}>
                {loading ? "Generating DNA…" : "Generate Delivery DNA"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
