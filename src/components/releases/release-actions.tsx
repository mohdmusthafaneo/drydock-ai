"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

type AssessReleaseButtonProps = {
  releaseId: string;
  reAssess?: boolean;
};

export function AssessReleaseButton({ releaseId, reAssess = false }: AssessReleaseButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assess() {
    if (reAssess) {
      const confirmed = window.confirm(
        "Re-assess will replace pending recommendations and reset approvals. Continue?",
      );
      if (!confirmed) return;
    }

    setLoading(true);
    setError(null);
    const res = await fetch(`/api/releases/${releaseId}/assess`, {
      method: "POST",
      credentials: "same-origin",
    });
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
      <Button onClick={assess} disabled={loading} variant="ink" size="lg">
        {loading
          ? "Assessing…"
          : reAssess
            ? "Re-run governance & QA assessment"
            : "Run governance & QA assessment"}
      </Button>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
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
    const res = await fetch(`/api/releases/${releaseId}/deploy`, {
      method: "POST",
      credentials: "same-origin",
    });
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
      <Button onClick={deploy} disabled={loading} variant="ink" size="lg">
        {loading ? "Executing…" : "Execute controlled deployment"}
      </Button>
      {error && <p className="mt-2 text-sm text-error">{error}</p>}
    </div>
  );
}
