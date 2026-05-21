import path from "node:path";
import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient } from "@/generated/prisma/client";

/** Bump when schema changes so dev hot-reload picks up a fresh client. */
const PRISMA_SCHEMA_VERSION = 7;

/** Delegates that must exist on a valid client (guards stale dev cache). */
const REQUIRED_DELEGATES = [
  "telemetryMetric",
  "telemetryEvent",
  "webhookEvent",
  "governancePolicy",
  "orgInvitation",
  "deploymentEvent",
  "incident",
  "agentRegistry",
] as const;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaSchemaVersion?: number;
};

function createPrismaClient() {
  const url =
    process.env.DATABASE_URL ??
    `file:${path.join(process.cwd(), "prisma", "dev.db")}`;
  const adapter = new PrismaBetterSqlite3({ url });
  return new PrismaClient({ adapter });
}

function isStaleClient(client: PrismaClient): boolean {
  const record = client as unknown as Record<string, unknown>;
  return REQUIRED_DELEGATES.some((key) => record[key] === undefined);
}

function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (
    cached &&
    globalForPrisma.prismaSchemaVersion === PRISMA_SCHEMA_VERSION &&
    !isStaleClient(cached)
  ) {
    return cached;
  }

  const client = createPrismaClient();
  globalForPrisma.prisma = client;
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
  return client;
}

export const prisma = getPrismaClient();
