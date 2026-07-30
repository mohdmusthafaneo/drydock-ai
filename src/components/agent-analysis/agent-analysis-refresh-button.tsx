"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type StatusPayload = {
  latest: {
    qa: { analyzedAt: string } | null;
    devops: { analyzedAt: string } | null;
    governance: { analyzedAt: string } | null;
    productivity: { analyzedAt: string } | null;
  };
  planned?: Record<string, boolean>;
};

export function AgentAnalysisRefreshButton({
  label = "Refresh agent data",
}: {
  label?: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const baselineRef = useRef<string>("");
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current);
    };
  }, []);

  function fingerprint(data: StatusPayload): string {
    const l = data.latest;
    return [
      l.qa?.analyzedAt ?? "",
      l.devops?.analyzedAt ?? "",
      l.governance?.analyzedAt ?? "",
      l.productivity?.analyzedAt ?? "",
    ].join("|");
  }

  function startPolling(baseline: string) {
    setPolling(true);
    let ticks = 0;
    if (pollTimer.current) clearInterval(pollTimer.current);
    pollTimer.current = setInterval(async () => {
      ticks += 1;
      try {
        const res = await fetch("/api/agent-analysis/status", {
          credentials: "same-origin",
        });
        if (!res.ok) return;
        const data = (await res.json()) as StatusPayload;
        const next = fingerprint(data);
        const present = [
          data.latest.qa ? "QA" : null,
          data.latest.devops ? "DevOps" : null,
          data.latest.governance ? "Gov" : null,
          data.latest.productivity ? "Prod" : null,
        ].filter(Boolean);
        setMessage(
          `Agents running… ${present.length}/4 domains have data (${present.join(", ") || "none yet"}). Checking every 15s.`,
        );
        if (next !== baseline || ticks >= 40) {
          if (pollTimer.current) clearInterval(pollTimer.current);
          pollTimer.current = null;
          setPolling(false);
          setMessage(
            next !== baseline
              ? `Agent data updated — ${present.length}/4 domains ready.`
              : "Still waiting on agent runs — reload the page in a few minutes.",
          );
          router.refresh();
        }
      } catch {
        /* keep polling */
      }
    }, 15_000);
  }

  async function refresh() {
    setBusy(true);
    setMessage(null);
    try {
      const beforeRes = await fetch("/api/agent-analysis/status", {
        credentials: "same-origin",
      });
      if (beforeRes.ok) {
        baselineRef.current = fingerprint((await beforeRes.json()) as StatusPayload);
      }

      const res = await fetch("/api/agent-analysis/refresh", {
        method: "POST",
        credentials: "same-origin",
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Refresh failed");
      const planned = data.planned
        ? Object.entries(data.planned as Record<string, boolean>)
            .filter(([, v]) => v)
            .map(([k]) => k)
        : [];
      setMessage(
        planned.length
          ? `Started ${planned.join(", ")} — polling for new results…`
          : "Refresh started, but no integrations are ready (check AWS/Jira/GitHub).",
      );
      startPolling(baselineRef.current);
      setTimeout(() => router.refresh(), 2_000);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Refresh failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <Button
        type="button"
        size="sm"
        variant="secondary"
        disabled={busy || polling}
        onClick={refresh}
      >
        <RefreshCw
          className={busy || polling ? "h-4 w-4 animate-spin" : "h-4 w-4"}
        />
        {busy ? "Starting…" : polling ? "Agents running…" : label}
      </Button>
      {message && <p className="max-w-lg text-xs text-muted">{message}</p>}
    </div>
  );
}
