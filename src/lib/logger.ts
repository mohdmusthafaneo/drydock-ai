import { AsyncLocalStorage } from "node:async_hooks";
import pino, { type Logger } from "pino";
import { getEnv } from "@/lib/env";

type LogContext = {
  correlationId?: string;
};

const logContext = new AsyncLocalStorage<LogContext>();

function createRootLogger(): Logger {
  const { LOG_LEVEL } = getEnv();
  return pino({ level: LOG_LEVEL });
}

let rootLogger: Logger | null = null;

function getRootLogger(): Logger {
  if (!rootLogger) {
    rootLogger = createRootLogger();
  }
  return rootLogger;
}

export function getCorrelationId(): string | undefined {
  return logContext.getStore()?.correlationId;
}

export function runWithCorrelationId<T>(
  correlationId: string,
  fn: () => T,
): T {
  return logContext.run({ correlationId }, fn);
}

/** Structured logger with optional bindings and active correlation ID. */
export function createLogger(bindings?: Record<string, unknown>): Logger {
  const correlationId = getCorrelationId();
  const logger = getRootLogger();

  if (!correlationId && !bindings) {
    return logger;
  }

  return logger.child({
    ...(correlationId ? { correlationId } : {}),
    ...bindings,
  });
}

/** Read correlation ID from request headers or generate a new one. */
export function resolveCorrelationId(
  request: Request,
  headerName = "x-correlation-id",
): string {
  const existing = request.headers.get(headerName)?.trim();
  if (existing) return existing;
  return crypto.randomUUID();
}

/** Logger scoped to an HTTP request (correlation ID from headers). */
export function getRequestLogger(
  request: Request,
  bindings?: Record<string, unknown>,
): Logger {
  return createLogger({
    correlationId: resolveCorrelationId(request),
    ...bindings,
  });
}

export function logServerStartup(message: string, meta?: Record<string, unknown>): void {
  createLogger({ component: "server" }).info(meta ?? {}, message);
}
