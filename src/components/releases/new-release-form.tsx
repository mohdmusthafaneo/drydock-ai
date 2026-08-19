"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

const selectClass =
  "mt-1 flex h-10 w-full rounded-lg border border-border bg-input px-3 text-sm text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand";

export function NewReleaseForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const serviceScopeRaw = (form.get("serviceScope") as string)?.trim();
    const serviceScope = serviceScopeRaw
      ? serviceScopeRaw.split(",").map((s) => s.trim()).filter(Boolean)
      : undefined;

    const res = await fetch("/api/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        name: form.get("name"),
        version: form.get("version") || undefined,
        branch: form.get("branch") || undefined,
        jiraFixVersion: form.get("jiraFixVersion") || undefined,
        serviceScope,
        environment: form.get("environment"),
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Failed to register release");
      return;
    }

    router.push(`/releases/${data.release.id}`);
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="name">Release name</Label>
            <Input
              id="name"
              name="name"
              required
              placeholder="e.g. Checkout v2.4"
            />
          </div>
          <div>
            <Label htmlFor="version">Version (optional)</Label>
            <Input id="version" name="version" placeholder="e.g. 2.4.1" />
          </div>
          <div>
            <Label htmlFor="branch">CI branch (optional)</Label>
            <Input
              id="branch"
              name="branch"
              placeholder="e.g. release/2.4 — defaults to production branch from toolchain"
            />
          </div>
          <div>
            <Label htmlFor="jiraFixVersion">Jira fix version (optional)</Label>
            <Input
              id="jiraFixVersion"
              name="jiraFixVersion"
              placeholder="e.g. v2.4.1 — overrides auto-match"
            />
          </div>
          <div>
            <Label htmlFor="serviceScope">Metrics service scope (optional)</Label>
            <Input
              id="serviceScope"
              name="serviceScope"
              placeholder="Comma-separated scope ids, e.g. api, checkout"
            />
            <p className="mt-1 text-xs text-muted">
              Matches observability service scope ids configured on Integrations.
            </p>
          </div>
          <div>
            <Label htmlFor="environment">Target environment</Label>
            <select
              id="environment"
              name="environment"
              required
              className={selectClass}
              defaultValue="STAGING"
            >
              <option value="DEVELOPMENT">Development</option>
              <option value="STAGING">Staging</option>
              <option value="PRODUCTION">Production</option>
            </select>
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button type="submit" disabled={loading} variant="ink" size="lg" className="w-full">
            {loading ? "Registering…" : "Register release event"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
