"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type AgentActionsProps = {
  agentId: string;
  status: string;
};

export function AgentActions({ agentId, status }: AgentActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function callAction(action: "wakeup" | "pause" | "resume") {
    setLoading(action);
    setMessage(null);

    const res = await fetch(`/api/agents/${agentId}/${action}`, {
      method: "POST",
      credentials: "same-origin",
    });

    setLoading(null);

    if (res.ok) {
      const data = (await res.json()) as { coalesced?: boolean };
      if (action === "wakeup") {
        setMessage(
          data.coalesced
            ? "Invoke coalesced with pending wakeup"
            : "Wakeup queued — worker will run heartbeat",
        );
      }
      router.refresh();
      return;
    }

    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setMessage(data.error ?? "Action failed");
  }

  const isPaused = status === "PAUSED";
  const isRunning = status === "RUNNING";
  const canInvoke = !isPaused && !isRunning && status !== "TERMINATED";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={!canInvoke || loading !== null}
          onClick={() => callAction("wakeup")}
        >
          {loading === "wakeup" ? "Invoking…" : "Invoke"}
        </Button>
        {isPaused ? (
          <Button
            size="sm"
            variant="secondary"
            disabled={loading !== null}
            onClick={() => callAction("resume")}
          >
            {loading === "resume" ? "Resuming…" : "Resume"}
          </Button>
        ) : (
          <Button
            size="sm"
            variant="secondary"
            disabled={isRunning || loading !== null}
            onClick={() => callAction("pause")}
          >
            {loading === "pause" ? "Pausing…" : "Pause"}
          </Button>
        )}
        <Button size="sm" variant="ghost" asChild>
          <Link href={`/agents/${agentId}/runs`}>Run history</Link>
        </Button>
      </div>
      {message && <p className="text-xs text-slate-400">{message}</p>}
    </div>
  );
}
