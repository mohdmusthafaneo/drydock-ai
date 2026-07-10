/**
 * Local dev / production agent worker — pg-boss job consumers.
 *
 * Usage:
 *   npm run worker:agents
 *
 * Requires DATABASE_URL (pg-boss uses the same Postgres as Prisma/Mastra).
 */
import "dotenv/config";

import { runJobWorkerProcess } from "@/lib/jobs/bootstrap";

if (!process.env.DATABASE_URL?.trim()) {
  console.error("DATABASE_URL is required for agent worker");
  process.exit(1);
}

console.log("Agent worker: pg-boss mode");

async function main(): Promise<void> {
  await runJobWorkerProcess();
}

main().catch((err) => {
  console.error("Agent worker failed:", err);
  process.exit(1);
});
