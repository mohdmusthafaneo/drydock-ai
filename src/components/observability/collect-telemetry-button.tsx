"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Radio } from "lucide-react";
import { Button } from "@/components/ui/button";

export function CollectTelemetryButton({
  releaseId,
  postDeploy = false,
  label = "Collect telemetry",
}: {
  releaseId?: string;
  postDeploy?: boolean;
  label?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function collect() {
    setLoading(true);
    setMessage(null);
    const res = await fetch("/api/telemetry/ingest", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mode: "collect", releaseId, postDeploy }),
    });
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setMessage(data.error || "Collection failed");
      return;
    }
    setMessage(
      data.correlationId
        ? `Ingested ${data.eventCount ?? 0} events · ${data.metricCount ?? 0} metrics`
        : "Telemetry collected",
    );
    router.refresh();
  }

  return (
    <div>
      <Button onClick={collect} disabled={loading} variant="brand" size="sm">
        <Radio className="h-4 w-4" />
        {loading ? "Collecting…" : label}
      </Button>
      {message && <p className="mt-2 text-xs text-muted">{message}</p>}
    </div>
  );
}
