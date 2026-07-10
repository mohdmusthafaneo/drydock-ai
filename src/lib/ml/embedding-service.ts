/**
 * Embedding / scoring client for the Python ML inference sidecar (Phase 4 / D6).
 * Callers depend on this interface so the backend can be swapped without rewrites.
 */

import { getEnv } from "@/lib/env";
import { createLogger } from "@/lib/logger";

const log = createLogger({ component: "ml/embedding-service" });

export type EmbedResult = {
  vectors: number[][];
  model: string;
  dim: number;
};

export type ScoreResult = {
  score: number;
  rationale: string;
};

export interface EmbeddingService {
  embed(texts: string[]): Promise<EmbedResult>;
  score(diff: string): Promise<ScoreResult>;
  health(): Promise<{ ok: boolean; ready: boolean; model: string }>;
}

function resolveBaseUrl(): string {
  const fromEnv = getEnv().ML_INFERENCE_URL?.trim();
  return (fromEnv || process.env.ML_INFERENCE_URL || "http://localhost:8080").replace(
    /\/$/,
    "",
  );
}

export class HttpEmbeddingService implements EmbeddingService {
  constructor(private readonly baseUrl: string = resolveBaseUrl()) {}

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const res = await fetch(url, {
      ...init,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {}),
      },
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`ML inference ${path} failed (${res.status}): ${body.slice(0, 400)}`);
    }
    return (await res.json()) as T;
  }

  async embed(texts: string[]): Promise<EmbedResult> {
    if (texts.length === 0) {
      throw new Error("embed() requires at least one text");
    }
    log.debug({ count: texts.length }, "embed request");
    return this.request<EmbedResult>("/embed", {
      method: "POST",
      body: JSON.stringify({ texts }),
    });
  }

  async score(diff: string): Promise<ScoreResult> {
    if (!diff.trim()) {
      throw new Error("score() requires a non-empty diff");
    }
    return this.request<ScoreResult>("/score", {
      method: "POST",
      body: JSON.stringify({ diff }),
    });
  }

  async health(): Promise<{ ok: boolean; ready: boolean; model: string }> {
    const data = await this.request<{
      ok: boolean;
      ready: boolean;
      model: string;
    }>("/healthz");
    return { ok: data.ok, ready: data.ready, model: data.model };
  }
}

let cached: EmbeddingService | null = null;

export function getEmbeddingService(): EmbeddingService {
  if (!cached) cached = new HttpEmbeddingService();
  return cached;
}

/** Test helper. */
export function resetEmbeddingServiceForTests(): void {
  cached = null;
}
