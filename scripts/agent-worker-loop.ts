/**
 * Local dev / production worker — pg-boss job consumers when enabled,
 * otherwise polls POST /api/cron/agents/worker on an interval.
 *
 * Usage:
 *   npm run worker:agents
 *
 * Requires PLATFORM_WORKER_SECRET (legacy mode) or DATABASE_URL (pg-boss mode).
 */
import "dotenv/config";

import { isPgBossEnabled } from "@/lib/jobs/boss";
import { runJobWorkerProcess } from "@/lib/jobs/bootstrap";

const baseUrl = (
  process.env.AIDOS_API_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "http://localhost:3000"
).replace(/\/$/, "");

const secret = process.env.PLATFORM_WORKER_SECRET?.trim();
const intervalSec = Number(process.env.AGENT_WORKER_INTERVAL_SEC ?? "15");

async function runLegacyHttpWorkerLoop(): Promise<void> {
  if (!secret) {
    console.error("PLATFORM_WORKER_SECRET is not set");
    process.exit(1);
  }

  async function tick() {
    try {
      const res = await fetch(`${baseUrl}/api/cron/agents/worker`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
        },
      });

      const body = (await res.json().catch(() => ({}))) as Record<
        string,
        unknown
      >;

      if (!res.ok) {
        console.error(
          `[${new Date().toISOString()}] worker HTTP ${res.status}`,
          body,
        );
        return;
      }

      if (body.disabled) {
        console.log(
          `[${new Date().toISOString()}] AGENT_WORKER_ENABLED=false — idle`,
        );
        return;
      }

      if (body.pgBoss) {
        console.log(
          `[${new Date().toISOString()}] pg-boss enabled on web — HTTP drain is a no-op`,
        );
        return;
      }

      console.log(
        `[${new Date().toISOString()}] processed=${body.wakeupsProcessed ?? 0} ok=${body.runsSucceeded ?? 0} fail=${body.runsFailed ?? 0} timers=${body.timersEnqueued ?? 0}`,
      );
    } catch (err) {
      console.error(`[${new Date().toISOString()}] worker tick failed`, err);
    }
  }

  console.log(
    `Agent worker loop (legacy HTTP) → ${baseUrl}/api/cron/agents/worker every ${intervalSec}s`,
  );

  await tick();
  setInterval(tick, intervalSec * 1000);
}

if (isPgBossEnabled()) {
  console.log("Agent worker: pg-boss mode (DATABASE_URL)");
  await runJobWorkerProcess();
} else {
  await runLegacyHttpWorkerLoop();
}
