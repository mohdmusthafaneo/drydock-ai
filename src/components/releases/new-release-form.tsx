"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export function NewReleaseForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const res = await fetch("/api/releases", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.get("name"),
        version: form.get("version") || undefined,
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
            <Label htmlFor="environment">Target environment</Label>
            <select
              id="environment"
              name="environment"
              required
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
              defaultValue="STAGING"
            >
              <option value="DEVELOPMENT">Development</option>
              <option value="STAGING">Staging</option>
              <option value="PRODUCTION">Production</option>
            </select>
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Registering…" : "Register release event"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
