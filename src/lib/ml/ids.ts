import { randomBytes } from "node:crypto";

/** Lightweight cuid-like id for raw SQL inserts (avoids Prisma create for Unsupported columns). */
export function createId(): string {
  return `c${randomBytes(12).toString("hex")}`;
}
