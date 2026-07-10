import { createId } from "@/lib/ml/ids";
import { asSystem } from "@/lib/prisma";
import type { EmbeddingRefType } from "@/generated/prisma/client";

export const DEFAULT_EMBEDDING_DIM = 384;
export const DEFAULT_EMBEDDING_MODEL = "sentence-transformers/all-MiniLM-L6-v2";

/** Format a float array as a pgvector literal: `[0.1,0.2,…]`. */
export function toPgVectorLiteral(values: number[]): string {
  if (values.length === 0) {
    throw new Error("embedding vector must be non-empty");
  }
  for (const value of values) {
    if (!Number.isFinite(value)) {
      throw new Error("embedding vector contains non-finite values");
    }
  }
  return `[${values.join(",")}]`;
}

/** Parse a pgvector text/array response into number[]. */
export function parsePgVector(raw: unknown): number[] {
  if (Array.isArray(raw)) {
    return raw.map((v) => Number(v));
  }
  if (typeof raw !== "string") {
    throw new Error(`unexpected pgvector value type: ${typeof raw}`);
  }
  const trimmed = raw.trim().replace(/^\[/, "").replace(/\]$/, "");
  if (!trimmed) return [];
  return trimmed.split(",").map((part) => Number(part.trim()));
}

export type UpsertEmbeddingInput = {
  organizationId: string;
  refType: EmbeddingRefType;
  refId: string;
  modelName?: string;
  vector: number[];
};

export type EmbeddingRow = {
  id: string;
  organizationId: string;
  refType: EmbeddingRefType;
  refId: string;
  modelName: string;
  dim: number;
  vector: number[];
  distance: number | null;
};

/**
 * Upsert an embedding row (metadata via Prisma unique key; vector via raw SQL).
 * Tenant-scoped: always filters/writes with organizationId.
 */
export async function upsertEmbedding(
  input: UpsertEmbeddingInput,
): Promise<{ id: string }> {
  const modelName = input.modelName ?? DEFAULT_EMBEDDING_MODEL;
  const dim = input.vector.length;
  if (dim !== DEFAULT_EMBEDDING_DIM) {
    throw new Error(
      `expected ${DEFAULT_EMBEDDING_DIM}-dim embedding, got ${dim}`,
    );
  }

  const id = createId();
  const literal = toPgVectorLiteral(input.vector);
  const db = asSystem();

  const rows = await db.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "Embedding" (
      "id", "organizationId", "refType", "refId", "modelName", "dim", "vector", "createdAt", "updatedAt"
    )
    VALUES (
      ${id},
      ${input.organizationId},
      ${input.refType}::"EmbeddingRefType",
      ${input.refId},
      ${modelName},
      ${dim},
      ${literal}::vector,
      NOW(),
      NOW()
    )
    ON CONFLICT ("organizationId", "refType", "refId", "modelName")
    DO UPDATE SET
      "dim" = EXCLUDED."dim",
      "vector" = EXCLUDED."vector",
      "updatedAt" = NOW()
    RETURNING "id"
  `;

  const row = rows[0];
  if (!row) throw new Error("upsertEmbedding returned no row");
  return { id: row.id };
}

export type SimilaritySearchInput = {
  organizationId: string;
  queryVector: number[];
  refType?: EmbeddingRefType;
  modelName?: string;
  limit?: number;
};

/**
 * Tenant-scoped cosine nearest-neighbor search via pgvector (`<=>` distance).
 */
export async function searchSimilarEmbeddings(
  input: SimilaritySearchInput,
): Promise<EmbeddingRow[]> {
  const modelName = input.modelName ?? DEFAULT_EMBEDDING_MODEL;
  const limit = input.limit ?? 8;
  const literal = toPgVectorLiteral(input.queryVector);
  const db = asSystem();

  if (input.refType) {
    return db.$queryRaw<EmbeddingRow[]>`
      SELECT
        "id",
        "organizationId",
        "refType",
        "refId",
        "modelName",
        "dim",
        "vector"::text AS "vector",
        ("vector" <=> ${literal}::vector) AS "distance"
      FROM "Embedding"
      WHERE "organizationId" = ${input.organizationId}
        AND "modelName" = ${modelName}
        AND "refType" = ${input.refType}::"EmbeddingRefType"
      ORDER BY "vector" <=> ${literal}::vector
      LIMIT ${limit}
    `.then((rows) =>
      rows.map((row) => ({
        ...row,
        vector: parsePgVector(row.vector),
        distance: row.distance == null ? null : Number(row.distance),
      })),
    );
  }

  return db.$queryRaw<EmbeddingRow[]>`
    SELECT
      "id",
      "organizationId",
      "refType",
      "refId",
      "modelName",
      "dim",
      "vector"::text AS "vector",
      ("vector" <=> ${literal}::vector) AS "distance"
    FROM "Embedding"
    WHERE "organizationId" = ${input.organizationId}
      AND "modelName" = ${modelName}
    ORDER BY "vector" <=> ${literal}::vector
    LIMIT ${limit}
  `.then((rows) =>
    rows.map((row) => ({
      ...row,
      vector: parsePgVector(row.vector),
      distance: row.distance == null ? null : Number(row.distance),
    })),
  );
}

/** Cosine similarity from pgvector cosine distance (1 - distance). */
export function cosineSimilarityFromDistance(distance: number): number {
  return 1 - distance;
}
