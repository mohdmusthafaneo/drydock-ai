import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";
import { PrismaClient } from "@/generated/prisma/client";
import { createTenantExtension } from "@/lib/prisma-tenant";

/** Bump when schema changes so dev hot-reload picks up a fresh client. */
const PRISMA_SCHEMA_VERSION = 15;

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
  "codeAnalysisRun",
  "codeAnalysisCommit",
  "codeAnalysisPullRequest",
  "embedding",
  "ticketSnapshot",
  "commitSnapshot",
  "evidenceLink",
  "evidenceReview",
] as const;

const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  prismaRead?: PrismaClient;
  prismaSchemaVersion?: number;
  prismaReadUrl?: string;
};

const JSON_COERCED_WRITE_OPERATIONS = new Set([
  "create",
  "update",
  "upsert",
  "createMany",
  "updateMany",
]);

function parseJsonLikeString(value: string): unknown {
  const trimmed = value.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value;

  try {
    return JSON.parse(trimmed);
  } catch {
    return value;
  }
}

function coerceJsonLikeStrings(value: unknown): unknown {
  if (typeof value === "string") return parseJsonLikeString(value);
  if (Array.isArray(value)) return value.map(coerceJsonLikeStrings);
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value).map(([key, nestedValue]) => [
      key,
      coerceJsonLikeStrings(nestedValue),
    ]),
  );
}

function coerceJsonWriteArgs(args: unknown): unknown {
  if (!args || typeof args !== "object") return args;

  const record = args as Record<string, unknown>;
  return {
    ...record,
    data:
      "data" in record ? coerceJsonLikeStrings(record.data) : record.data,
    create:
      "create" in record ? coerceJsonLikeStrings(record.create) : record.create,
    update:
      "update" in record ? coerceJsonLikeStrings(record.update) : record.update,
  };
}

/** Create Prisma client with pg adapter for PostgreSQL */
function createPrismaClient(connectionString: string): PrismaClient {
  const pool = new pg.Pool({ connectionString });
  const adapter = new PrismaPg(pool);
  const client = new PrismaClient({ adapter }).$extends({
    query: {
      $allModels: {
        async $allOperations({ operation, args, query }) {
          const coercedArgs = JSON_COERCED_WRITE_OPERATIONS.has(operation)
            ? coerceJsonWriteArgs(args)
            : args;
          return query(coercedArgs as typeof args);
        },
      },
    },
  });
  return client as unknown as PrismaClient;
}

function isStaleClient(client: PrismaClient): boolean {
  const record = client as unknown as Record<string, unknown>;
  return REQUIRED_DELEGATES.some((key) => record[key] === undefined);
}

function requireDatabaseUrl(): string {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is required");
  }
  return connectionString;
}

/** Get or create primary Prisma client - lazy to avoid build-time errors */
function getPrismaClient(): PrismaClient {
  const cached = globalForPrisma.prisma;
  if (
    cached &&
    globalForPrisma.prismaSchemaVersion === PRISMA_SCHEMA_VERSION &&
    !isStaleClient(cached)
  ) {
    return cached;
  }

  const client = createPrismaClient(requireDatabaseUrl());
  globalForPrisma.prisma = client;
  globalForPrisma.prismaSchemaVersion = PRISMA_SCHEMA_VERSION;
  return client;
}

function resolveReplicaUrl(): string | undefined {
  return (
    process.env.DATABASE_URL_REPLICA?.trim() ||
    undefined
  );
}

/**
 * Read-preferring client: uses DATABASE_URL_REPLICA when set, else primary.
 * For analytics / dashboard reads that tolerate replica lag.
 */
export function getPrismaRead(): PrismaClient {
  const replicaUrl = resolveReplicaUrl();
  if (!replicaUrl) {
    return getPrismaClient();
  }

  if (
    globalForPrisma.prismaRead &&
    globalForPrisma.prismaReadUrl === replicaUrl &&
    globalForPrisma.prismaSchemaVersion === PRISMA_SCHEMA_VERSION &&
    !isStaleClient(globalForPrisma.prismaRead)
  ) {
    return globalForPrisma.prismaRead;
  }

  const client = createPrismaClient(replicaUrl);
  globalForPrisma.prismaRead = client;
  globalForPrisma.prismaReadUrl = replicaUrl;
  return client;
}

/** True when analytics reads will hit a dedicated replica URL. */
export function isReadReplicaConfigured(): boolean {
  return Boolean(resolveReplicaUrl());
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

/**
 * Unscoped Prisma client (system / cross-tenant). Prefer `forOrg()` in
 * request paths; use `asSystem()` explicitly in cron/fan-out/worker code.
 */
export const prisma = lazyPrisma;

/** Explicit escape hatch for cross-tenant jobs (cron fan-out, recoveries). */
export function asSystem(): PrismaClient {
  return getPrismaClient();
}

/**
 * Tenant-scoped client: auto-injects `organizationId` on tenant-owned models.
 * Use for session-authenticated and agent-authenticated request paths.
 */
export function forOrg(organizationId: string): PrismaClient {
  const base = getPrismaClient();
  return base.$extends(createTenantExtension(organizationId)) as unknown as PrismaClient;
}

/**
 * Tenant-scoped read client (replica when DATABASE_URL_REPLICA is set).
 * Use for dashboard / analytics paths that do not write.
 */
export function forOrgRead(organizationId: string): PrismaClient {
  const base = getPrismaRead();
  return base.$extends(createTenantExtension(organizationId)) as unknown as PrismaClient;
}
