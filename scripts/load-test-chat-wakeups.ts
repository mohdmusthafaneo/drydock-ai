/**
 * Phase M4 — enqueue N concurrent chat wakeups and drain the worker queue.
 *
 * Verifies worker drain under parallel chat load and reports Mastra storage growth.
 *
 * Usage:
 *   npx tsx scripts/load-test-chat-wakeups.ts
 *   npx tsx scripts/load-test-chat-wakeups.ts --concurrency 10 --timeout-sec 300
 *   npx tsx scripts/load-test-chat-wakeups.ts --org-id <cuid>
 *   npx tsx scripts/load-test-chat-wakeups.ts --enqueue-only
 *
 * Requires:
 *   - DATABASE_URL
 *   - At least one org with Super Agent (adapterType=mastra) and an active user
 *   - ANTHROPIC_API_KEY (unless --enqueue-only)
 */
import "dotenv/config";
import { Pool } from "pg";

import { createAgentChatThread } from "@/lib/agent-chat/threads";
import { drainWakeupQueue } from "@/lib/agent-control-plane/worker";
import { prisma } from "@/lib/prisma";
import {
  resolveMastraPgSchema,
  resolveMastraPostgresConnectionString,
} from "@/mastra/config/storage";

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string, fallback: string) => {
    const idx = args.indexOf(flag);
    return idx >= 0 && args[idx + 1] ? args[idx + 1]! : fallback;
  };
  return {
    concurrency: Number(get("--concurrency", "10")),
    timeoutSec: Number(get("--timeout-sec", "300")),
    orgId: get("--org-id", ""),
    enqueueOnly: args.includes("--enqueue-only"),
  };
}

async function mastraStorageBytes(): Promise<number> {
  const pool = new Pool({ connectionString: resolveMastraPostgresConnectionString() });
  const schema = resolveMastraPgSchema();

  try {
    const result = await pool.query<{ bytes: string }>(
      `SELECT COALESCE(SUM(pg_total_relation_size(quote_ident(schemaname) || '.' || quote_ident(tablename))), 0) AS bytes
       FROM pg_tables
       WHERE schemaname = $1`,
      [schema],
    );
    return Number(result.rows[0]?.bytes ?? 0);
  } catch {
    return 0;
  } finally {
    await pool.end().catch(() => undefined);
  }
}

async function resolveTestOrg(orgIdArg: string) {
  if (orgIdArg) {
    const org = await prisma.organization.findUnique({ where: { id: orgIdArg } });
    if (!org) throw new Error(`Organization not found: ${orgIdArg}`);
    return org.id;
  }

  const agent = await prisma.agentRegistry.findFirst({
    where: { agentType: "SUPER_ORCHESTRATOR", adapterType: "mastra" },
    orderBy: { createdAt: "asc" },
  });
  if (!agent) {
    throw new Error("No Super Agent with adapterType=mastra found — seed an org first");
  }
  return agent.organizationId;
}

async function main() {
  const { concurrency, timeoutSec, orgId: orgIdArg, enqueueOnly } = parseArgs();

  if (!enqueueOnly && !process.env.ANTHROPIC_API_KEY?.trim()) {
    console.error("ANTHROPIC_API_KEY is required for full load test (or pass --enqueue-only)");
    process.exit(1);
  }

  const organizationId = await resolveTestOrg(orgIdArg);

  const user = await prisma.user.findFirst({
    where: { organizationId, status: "ACTIVE" },
    orderBy: { createdAt: "asc" },
  });
  if (!user) {
    throw new Error(`No active user in org ${organizationId}`);
  }

  const storageBefore = await mastraStorageBytes();
  const startedAt = Date.now();

  console.log(`Load test: ${concurrency} concurrent chat wakeups`);
  console.log(`  org=${organizationId} user=${user.id}`);
  console.log(`  mastra postgres storage=${storageBefore}B`);

  const enqueueStarted = Date.now();
  const results = await Promise.all(
    Array.from({ length: concurrency }, (_, i) =>
      createAgentChatThread({
        organizationId,
        userId: user.id,
        title: `Load test ${startedAt} #${i + 1}`,
        initialMessage: `Load test message ${i + 1} at ${new Date().toISOString()}`,
      }),
    ),
  );

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`Failed to create ${failed.length} thread(s):`, failed[0]);
    process.exit(1);
  }

  const wakeupIds = results
    .map((r) => (r.ok ? r.data.wakeupId : undefined))
    .filter((id): id is string => Boolean(id));

  const enqueueMs = Date.now() - enqueueStarted;
  console.log(`Enqueued ${wakeupIds.length} chat wakeups in ${enqueueMs}ms`);

  if (enqueueOnly) {
    console.log("(--enqueue-only) Skipping worker drain.");
    return;
  }

  const deadline = Date.now() + timeoutSec * 1000;
  let drainTicks = 0;
  let totalProcessed = 0;
  let totalSucceeded = 0;
  let totalFailed = 0;

  while (Date.now() < deadline) {
    const pending = await prisma.agentWakeupRequest.count({
      where: {
        organizationId,
        status: "queued",
        source: "chat",
      },
    });

    if (pending === 0) break;

    const tick = await drainWakeupQueue(organizationId, concurrency);
    drainTicks++;
    totalProcessed += tick.wakeupsProcessed;
    totalSucceeded += tick.runsSucceeded;
    totalFailed += tick.runsFailed;

    if (tick.errors.length > 0) {
      console.warn("Worker errors:", tick.errors.slice(0, 3));
    }

    await new Promise((r) => setTimeout(r, 500));
  }

  const remaining = await prisma.agentWakeupRequest.count({
    where: { organizationId, status: "queued", source: "chat" },
  });

  const storageAfter = await mastraStorageBytes();
  const elapsedMs = Date.now() - startedAt;

  console.log("\n=== Results ===");
  console.log(`  elapsed: ${elapsedMs}ms`);
  console.log(`  drain ticks: ${drainTicks}`);
  console.log(`  wakeups processed: ${totalProcessed} (ok=${totalSucceeded} fail=${totalFailed})`);
  console.log(`  queued remaining: ${remaining}`);
  console.log(
    `  mastra postgres storage: ${storageBefore} → ${storageAfter} B (+${storageAfter - storageBefore})`,
  );

  if (remaining > 0) {
    console.error(`\nFAIL: ${remaining} chat wakeup(s) still queued after ${timeoutSec}s timeout`);
    process.exit(1);
  }

  console.log("\nPASS: all chat wakeups drained");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
