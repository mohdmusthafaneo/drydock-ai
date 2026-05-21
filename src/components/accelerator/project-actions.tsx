"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function GeneratePackageButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/accelerator/${projectId}/generate`, {
      method: "POST",
      credentials: "same-origin",
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "Generation failed");
      return;
    }
    router.refresh();
  }

  return (
    <div className="space-y-2">
      <Button variant="ai" onClick={generate} disabled={loading}>
        {loading ? "Generating MVP package…" : "Generate full MVP package"}
      </Button>
      {error && <p className="text-sm text-[#fca5a5]">{error}</p>}
    </div>
  );
}

export function ApprovePackageButton({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function approve() {
    setLoading(true);
    await fetch(`/api/accelerator/${projectId}/approve`, {
      method: "POST",
      credentials: "same-origin",
    });
    setLoading(false);
    router.refresh();
  }

  return (
    <Button onClick={approve} disabled={loading}>
      {loading ? "Approving…" : "Approve MVP package"}
    </Button>
  );
}
