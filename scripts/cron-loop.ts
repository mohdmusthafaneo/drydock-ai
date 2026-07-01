/**
 * Local dev / worker helper — polls platform cron endpoints on staggered intervals.
 *
 * Usage:
 *   npm run worker:cron
 *
 * Requires PLATFORM_WORKER_SECRET and a running app (npm run dev).
 */
import "dotenv/config";

const baseUrl = (
  process.env.AIDOS_API_URL?.trim() ||
  process.env.NEXT_PUBLIC_APP_URL?.trim() ||
  "http://localhost:3000"
).replace(/\/$/, "");

const secret = process.env.PLATFORM_WORKER_SECRET?.trim();

type CronJob = {
  name: string;
  path: string;
  intervalSec: number;
};

function readIntervalSec(envKey: string, fallbackSec: number): number {
  const raw = process.env[envKey]?.trim();
  const parsed = raw ? Number.parseInt(raw, 10) : fallbackSec;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallbackSec;
}

const jobs: CronJob[] = [
  {
    name: "code-analysis-enrich",
    path: "/api/cron/code-analysis/enrich",
    intervalSec: readIntervalSec("CODE_ANALYSIS_ENRICH_INTERVAL_SEC", 900),
  },
  {
    name: "compliance-eval",
    path: "/api/cron/compliance/eval",
    intervalSec: readIntervalSec("COMPLIANCE_EVAL_INTERVAL_SEC", 1800),
  },
  {
    name: "jira-calibrate",
    path: "/api/cron/jira/calibrate",
    intervalSec: readIntervalSec("JIRA_CALIBRATE_INTERVAL_SEC", 86400),
  },
  {
    name: "executive-briefing-enrich",
    path: "/api/cron/executive-briefing/enrich",
    intervalSec: readIntervalSec("EXECUTIVE_BRIEFING_ENRICH_INTERVAL_SEC", 7200),
  },
  {
    name: "predictions-eval",
    path: "/api/cron/predictions/eval",
    intervalSec: readIntervalSec("PREDICTIONS_EVAL_INTERVAL_SEC", 3600),
  },
];

async function tick(job: CronJob) {
  if (!secret) return;

  try {
    const res = await fetch(`${baseUrl}${job.path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "Content-Type": "application/json",
      },
    });

    const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;

    if (!res.ok) {
      console.error(`[${new Date().toISOString()}] ${job.name} HTTP ${res.status}`, body);
      return;
    }

    console.log(`[${new Date().toISOString()}] ${job.name}`, body);
  } catch (err) {
    console.error(`[${new Date().toISOString()}] ${job.name} failed`, err);
  }
}

if (!secret) {
  console.error("PLATFORM_WORKER_SECRET is not set");
  process.exit(1);
}

console.log(`Cron loop → ${baseUrl}`);
for (const job of jobs) {
  console.log(`  ${job.name}: every ${job.intervalSec}s → ${job.path}`);
  void tick(job);
  setInterval(() => void tick(job), job.intervalSec * 1000);
}
