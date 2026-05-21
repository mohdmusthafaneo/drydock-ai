"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

export function AssessReleaseButton({ releaseId }: { releaseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assess() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/releases/${releaseId}/assess`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Assessment failed");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <Button onClick={assess} disabled={loading} variant="ai">
        {loading ? "Assessing…" : "Run governance & QA assessment"}
      </Button>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}

export function DeployReleaseButton({ releaseId }: { releaseId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function deploy() {
    setLoading(true);
    setError(null);
    const res = await fetch(`/api/releases/${releaseId}/deploy`, { method: "POST" });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "Deployment failed");
      return;
    }
    router.refresh();
  }

  return (
    <div>
      <Button onClick={deploy} disabled={loading}>
        {loading ? "Executing…" : "Execute controlled deployment"}
      </Button>
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </div>
  );
}
