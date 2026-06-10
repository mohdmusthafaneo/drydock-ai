import { prisma } from "@/lib/prisma";

export type PgScaleCheckResult = {
  ok: boolean;
  provider: string;
  checks: Array<{ name: string; ok: boolean; detail: string }>;
};

/**
 * Lightweight sanity checks for agent control plane queries at PostgreSQL scale.
 * Safe to run in dev (SQLite) — index checks are skipped when not PostgreSQL.
 */
export async function validateAgentControlPlaneScale(): Promise<PgScaleCheckResult> {
  const checks: PgScaleCheckResult["checks"] = [];
  const url = process.env.DATABASE_URL ?? "";
  const isPostgres = url.startsWith("postgresql://") || url.startsWith("postgres://");

  const [pendingWakeups, runningWakeups, recentRuns] = await Promise.all([
    prisma.agentWakeupRequest.count({ where: { status: "queued" } }),
    prisma.agentWakeupRequest.count({ where: { status: "running" } }),
    prisma.agentHeartbeatRun.count({
      where: {
        startedAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) },
      },
    }),
  ]);

  checks.push({
    name: "wakeup_queue_query",
    ok: true,
    detail: `${pendingWakeups} queued, ${runningWakeups} running`,
  });
  checks.push({
    name: "heartbeat_runs_7d",
    ok: true,
    detail: `${recentRuns} runs in last 7 days`,
  });

  if (isPostgres) {
    try {
      const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
        SELECT indexname FROM pg_indexes
        WHERE tablename IN ('AgentWakeupRequest', 'AgentHeartbeatRun', 'AgentRegistry')
      `;
      const names = new Set(indexes.map((i) => i.indexname));
      const required = [
        "AgentWakeupRequest_organizationId_status_requestedAt_idx",
        "AgentHeartbeatRun_organizationId_startedAt_idx",
        "AgentRegistry_organizationId_status_idx",
      ];
      const missing = required.filter((r) => !names.has(r));
      checks.push({
        name: "postgres_indexes",
        ok: missing.length === 0,
        detail:
          missing.length === 0
            ? "Required agent indexes present"
            : `Missing indexes: ${missing.join(", ")}`,
      });
    } catch (err) {
      checks.push({
        name: "postgres_indexes",
        ok: false,
        detail: err instanceof Error ? err.message : "Index check failed",
      });
    }
  } else {
    checks.push({
      name: "postgres_indexes",
      ok: true,
      detail: "Skipped — not PostgreSQL (use DATABASE_URL=postgresql://… before prod)",
    });
  }

  return {
    ok: checks.every((c) => c.ok),
    provider: isPostgres ? "postgresql" : "other",
    checks,
  };
}
