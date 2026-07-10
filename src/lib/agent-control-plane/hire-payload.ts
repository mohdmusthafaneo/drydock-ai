/** Client-safe hire approval payload helpers (no Prisma / Node imports). */

import { readJsonField } from "@/lib/json-field";

export type AgentHirePayloadPreview = {
  agentId?: string;
  displayName?: string;
  role?: string;
};

export function parseHirePayload(json: unknown): AgentHirePayloadPreview | null {
  const parsed = readJsonField<AgentHirePayloadPreview | null>(json, null);
  return parsed && typeof parsed === "object" ? parsed : null;
}
