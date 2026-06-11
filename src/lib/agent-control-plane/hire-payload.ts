/** Client-safe hire approval payload helpers (no Prisma / Node imports). */

export type AgentHirePayloadPreview = {
  agentId?: string;
  displayName?: string;
  role?: string;
};

export function parseHirePayload(json: string): AgentHirePayloadPreview | null {
  try {
    return JSON.parse(json) as AgentHirePayloadPreview;
  } catch {
    return null;
  }
}
