"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";

type AgentActionsProps = {
  agentId: string;
  status: string;
};

type WakeupStatusResponse = {
  done: boolean;
  status: string;
  agentStatus?: string;
  run?: {
    status: string;
    summary?: string | null;
    error?: string | null;
  } | null;
  error?: string | null;
};

const POLL_MS = 2000;
const POLL_TIMEOUT_MS = 600_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function AgentActions({ agentId, status }: AgentActionsProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function pollWakeup(wakeupId: string): Promise<WakeupStatusResponse | null> {
    const deadline = Date.now() + POLL_TIMEOUT_MS;

    while (Date.now() < deadline) {
      const res = await fetch(`/api/agents/${agentId}/wakeups/${wakeupId}`, {
        credentials: "same-origin",
      });

      if (!res.ok) return null;

      const data = (await res.json()) as WakeupStatusResponse;

      if (data.done) {
        return data;
      }

      if (data.status === "running" || data.agentStatus === "RUNNING") {
        setMessage("Running heartbeat…");
      } else if (data.status === "queued") {
        setMessage("Queued — waiting for worker…");
      }

      await sleep(POLL_MS);
    }

    return null;
  }

  async function callAction(action: "wakeup" | "pause" | "resume") {
    setLoading(action);
    setMessage(null);

    const res = await fetch(`/api/agents/${agentId}/${action}`, {
      method: "POST",
      credentials: "same-origin",
    });

    if (action !== "wakeup") {
      setLoading(null);
    }

    if (res.ok) {
      if (action === "wakeup") {
        const data = (await res.json()) as {
          coalesced?: boolean;
          wakeupId?: string;
          workerEnabled?: boolean;
          message?: string;
        };

        if (data.workerEnabled === false) {
          setMessage(
            "Wakeup queued — enable AGENT_WORKER_ENABLED and run npm run worker:agents",
          );
          setLoading(null);
          router.refresh();
          return;
        }

        if (!data.wakeupId) {
          setMessage("Wakeup queued");
          setLoading(null);
          router.refresh();
          return;
        }

        setMessage(
          data.coalesced
            ? "Merged with pending wakeup — waiting for worker…"
            : "Queued — waiting for worker…",
        );

        const result = await pollWakeup(data.wakeupId);
        setLoading(null);

        if (!result) {
          setMessage(
            "Still queued or running — check run history (start npm run worker:agents in dev)",
          );
          router.refresh();
          return;
        }

        const run = result.run;
        if (run?.status === "succeeded") {
          setMessage(
            data.coalesced
              ? `Heartbeat completed (merged): ${run.summary?.slice(0, 120) ?? "done"}`
              : `Heartbeat completed: ${run.summary?.slice(0, 120) ?? "done"}`,
          );
        } else if (run?.status === "failed") {
          setMessage(run.error ?? run.summary ?? "Heartbeat failed");
        } else if (result.status === "skipped") {
          setMessage(result.error ?? "Wakeup skipped");
        } else {
          setMessage("Heartbeat finished");
        }

        router.refresh();
        return;
      }

      router.refresh();
      return;
    }

    setLoading(null);
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
          <Link href={`/agents/${agentId}`}>Instructions</Link>
        </Button>
        <Button size="sm" variant="ghost" asChild>
          <Link href={`/agents/${agentId}/runs`}>Run history</Link>
        </Button>
      </div>
      {message && <p className="text-xs text-slate-400">{message}</p>}
    </div>
  );
}
