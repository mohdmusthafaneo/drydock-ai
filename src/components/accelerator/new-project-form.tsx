"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function NewProjectForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const payload = Object.fromEntries(form.entries());

    const res = await fetch("/api/accelerator", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Failed to create project");
      return;
    }

    router.push(`/accelerator/${data.project.id}`);
    router.refresh();
  }

  return (
    <Card className="mx-auto max-w-2xl">
      <CardHeader>
        <CardTitle>New MVP project</CardTitle>
        <CardDescription>
          Describe your idea. AIDOS will generate PRD, architecture, features, Jira epics, QA
          plan, and deployment plan — governed by your Delivery DNA.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="title">Project name</Label>
            <Input id="title" name="title" required placeholder="Customer onboarding portal" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="idea">Product idea</Label>
            <Textarea
              id="idea"
              name="idea"
              required
              rows={4}
              minLength={20}
              placeholder="We want to help teams go from idea to MVP in weeks with human-governed AI..."
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="targetUser">Target users</Label>
            <Input id="targetUser" name="targetUser" placeholder="Startup founders, product teams" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="problemStatement">Problem statement</Label>
            <Textarea
              id="problemStatement"
              name="problemStatement"
              rows={3}
              placeholder="What pain are you solving?"
            />
          </div>
          {error && <p className="text-sm text-error">{error}</p>}
          <Button type="submit" variant="ink" disabled={loading} className="w-full">
            {loading ? "Creating…" : "Create MVP project"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
