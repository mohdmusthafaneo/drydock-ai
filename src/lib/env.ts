import { z } from "zod";

const optionalBoolean = z
  .string()
  .optional()
  .transform((value) => {
    if (value === undefined) return undefined;
    return value === "true" || value === "1";
  });

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),

  DATABASE_URL: z.string().min(1).optional(),

  AUTH_SECRET: z.string().min(1).optional(),

  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  PLATFORM_WORKER_SECRET: z.string().optional(),
  AIDOS_PROCESS_ROLE: z.enum(["web", "worker"]).default("web"),
  AIDOS_API_URL: z.string().url().optional(),
  /** Comma-separated worker queue roles: all | agents | refresh | enrich | ml */
  WORKER_QUEUES: z.string().optional(),
  /** Base URL for the Python ML inference sidecar (Phase 4). */
  ML_INFERENCE_URL: z.string().url().optional(),

  AGENT_WORKER_ENABLED: optionalBoolean,
  AGENT_WORKER_POKE_ON_ENQUEUE: optionalBoolean,
  AGENT_WORKER_INTERVAL_SEC: z.coerce.number().int().positive().optional(),
  AGENT_WORKER_CONCURRENCY: z.coerce.number().int().positive().optional(),
  AGENT_DEFAULT_HEARTBEAT_SEC: z.coerce.number().int().positive().optional(),
  AGENT_INSTRUCTIONS_ROOT: z.string().min(1).optional(),

  ANTHROPIC_BASE_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().optional(),

  /** Global LLM kill-switch (`true` disables all metered features). */
  LLM_KILL_SWITCH: optionalBoolean,
  LLM_ORG_DAILY_TOKEN_BUDGET: z.coerce.number().int().positive().optional(),
  LLM_MODEL_DEFAULT: z.string().optional(),
  LLM_MODEL_CHEAP: z.string().optional(),
  LLM_CACHE_TTL_SEC: z.coerce.number().int().positive().optional(),

  MASTRA_PG_SCHEMA: z.string().min(1).optional(),
  MASTRA_DISCOVERY_DNA_LLM_ENABLED: optionalBoolean,
  MASTRA_MVP_ACCELERATOR_LLM_ENABLED: optionalBoolean,
  MASTRA_AGENT_THREAD_INGRESS_ENABLED: optionalBoolean,

  GITHUB_APP_SLUG: z.string().optional(),
  GITHUB_APP_ID: z.string().optional(),
  GITHUB_APP_PRIVATE_KEY: z.string().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().optional(),

  ATLASSIAN_CLIENT_ID: z.string().optional(),
  ATLASSIAN_CLIENT_SECRET: z.string().optional(),

  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type Env = z.infer<typeof envSchema>;

let cachedEnv: Env | null = null;

function formatZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ");
}

/** Parse and cache environment variables. Safe to call during build (no required-field enforcement). */
export function getEnv(): Env {
  if (cachedEnv) return cachedEnv;

  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    throw new Error(`Invalid environment configuration: ${formatZodError(result.error)}`);
  }

  cachedEnv = result.data;
  return cachedEnv;
}

function isProductionBuildPhase(): boolean {
  return process.env.NEXT_PHASE === "phase-production-build";
}

/**
 * Fail-fast validation for runtime server boot (web/worker).
 * Skipped during `next build` so DATABASE_URL is not required at compile time.
 */
export function validateRuntimeEnv(): void {
  if (isProductionBuildPhase()) return;

  const env = getEnv();
  const errors: string[] = [];

  if (!env.DATABASE_URL?.trim()) {
    errors.push("DATABASE_URL is required");
  }

  if (env.NODE_ENV === "production") {
    if (!env.AUTH_SECRET || env.AUTH_SECRET.length < 32) {
      errors.push("AUTH_SECRET must be at least 32 characters in production");
    }
    if (!env.NEXT_PUBLIC_APP_URL) {
      errors.push("NEXT_PUBLIC_APP_URL is required in production");
    }
  }

  if (errors.length > 0) {
    throw new Error(`Environment validation failed:\n- ${errors.join("\n- ")}`);
  }
}

/** Reset cached env — for tests only. */
export function resetEnvCacheForTests(): void {
  cachedEnv = null;
}
