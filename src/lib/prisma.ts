import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "@/generated/prisma/client";

/** Bump when schema changes so dev hot-reload picks up a fresh client. */
const PRISMA_SCHEMA_VERSION = 10;

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

/** Create Prisma client with pg adapter for PostgreSQL */
function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }

  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

function isStaleClient(client: PrismaClient): boolean {
  const record = client as unknown as Record<string, unknown>;
  return REQUIRED_DELEGATES.some((key) => record[key] === undefined);
}

/** Get or create Prisma client - uses lazy initialization to avoid build-time errors */
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

/** Lazy proxy that defers client creation until first property access */
function createLazyPrismaClient(): PrismaClient {
  let client: PrismaClient | null = null;
  
  return new Proxy({} as PrismaClient, {
    get(_target, prop) {
      if (!client) {
        client = getPrismaClient();
      }
      return (client as any)[prop];
    },
  });
}

// Use lazy initialization - client is created on first use, not at module load time
// This allows Next.js build to pass without requiring DATABASE_URL at build time
const lazyPrisma = createLazyPrismaClient();
export const prisma = lazyPrisma;