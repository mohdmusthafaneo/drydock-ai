import type { Prisma } from "@/generated/prisma/client";

/** Dual-read helper for String→jsonb migration: accepts legacy strings or Prisma JsonValue. */
export function readJsonField<T>(value: unknown, fallback: T): T {
  if (value === null || value === undefined) return fallback;

  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }

  return value as T;
}

/** Coerce stringified JSON to a Prisma Json write value (avoids double-encoding). */
export function asJsonInput(value: unknown): Prisma.InputJsonValue {
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        return JSON.parse(trimmed) as Prisma.InputJsonValue;
      } catch {
        return value;
      }
    }
    return value;
  }

  return value as Prisma.InputJsonValue;
}

/** Serialize a Json field for logging/hashing (or legacy string APIs). */
export function stringifyJsonField(value: unknown): string {
  if (typeof value === "string") return value;
  return JSON.stringify(value ?? null);
}
