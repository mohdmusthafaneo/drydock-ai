import { prisma } from "@/lib/prisma";

export type ReadinessCheck = {
  name: string;
  ok: boolean;
  detail?: string;
};

export type ReadinessResult = {
  ok: boolean;
  checks: ReadinessCheck[];
};

async function checkDatabaseConnectivity(): Promise<ReadinessCheck> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { name: "database", ok: true };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "database_unreachable";
    return { name: "database", ok: false, detail };
  }
}

async function checkMigrationsApplied(): Promise<ReadinessCheck> {
  try {
    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "_prisma_migrations"
      WHERE finished_at IS NULL
        AND rolled_back_at IS NULL
    `;

    const pending = Number(rows[0]?.count ?? 0);
    if (pending > 0) {
      return {
        name: "migrations",
        ok: false,
        detail: `${pending} pending migration(s)`,
      };
    }

    return { name: "migrations", ok: true };
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "migrations_check_failed";
    return { name: "migrations", ok: false, detail };
  }
}

export async function getReadiness(): Promise<ReadinessResult> {
  const checks = await Promise.all([
    checkDatabaseConnectivity(),
    checkMigrationsApplied(),
  ]);

  return {
    ok: checks.every((check) => check.ok),
    checks,
  };
}
