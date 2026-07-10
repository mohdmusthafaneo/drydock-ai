const DEFAULT_MASTRA_PG_SCHEMA = "mastra";

/** Postgres connection string for Mastra storage (uses DATABASE_URL). */
export function resolveMastraPostgresConnectionString(): string {
  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error("DATABASE_URL is required for Mastra Postgres storage");
  }
  return connectionString;
}

/** Dedicated Postgres schema so Mastra tables never collide with Prisma migrations. */
export function resolveMastraPgSchema(): string {
  return process.env.MASTRA_PG_SCHEMA?.trim() || DEFAULT_MASTRA_PG_SCHEMA;
}
