/**
 * Production agent worker — polls POST /api/cron/agents/worker.
 * Used by Docker when AIDOS_PROCESS_ROLE=worker (no tsx required).
 */
const baseUrl = (
  process.env.AIDOS_API_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "http://localhost:3000"
).replace(/\/$/, "");

const secret = process.env.PLATFORM_WORKER_SECRET?.trim();
const intervalSec = Number(process.env.AGENT_WORKER_INTERVAL_SEC ?? "30");

async function tick() {
  if (!secret) {
    console.error("PLATFORM_WORKER_SECRET is not set");
    process.exit(1);
  }

  try {
    const res = await fetch(`${baseUrl}/api/cron/agents/worker`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });

    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      console.error(`[${new Date().toISOString()}] worker HTTP ${res.status}`, body);
      return;
    }

    if (body.disabled) {
      console.log(`[${new Date().toISOString()}] AGENT_WORKER_ENABLED=false — idle`);
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
  `AIDOS agent worker → ${baseUrl}/api/cron/agents/worker every ${intervalSec}s`,
);

await tick();
setInterval(tick, intervalSec * 1000);
