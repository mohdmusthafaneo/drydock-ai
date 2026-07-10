import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import type { AgentRegistry } from "@/generated/prisma/client";
import { readJsonField } from "@/lib/json-field";
import { parseRuntimeConfig } from "./runtime-config";
import type { AgentPermissions } from "./types";

export type AuthenticatedAgent = {
  agent: AgentRegistry;
  organizationId: string;
  runtimeConfig: ReturnType<typeof parseRuntimeConfig>;
  permissions: AgentPermissions;
};

function readBearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;
  const token = header.slice("Bearer ".length).trim();
  return token.length > 0 ? token : null;
}

export function hashAgentApiKey(key: string): string {
  return createHash("sha256").update(key).digest("hex");
}

function keysMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

export function generateAgentApiKey(): string {
  const bytes = createHash("sha256")
    .update(`${Date.now()}-${Math.random()}`)
    .digest("base64url");
  return `aidos_agent_${bytes.slice(0, 43)}`;
}

export function parsePermissions(json: unknown): AgentPermissions {
  const parsed = readJsonField<Partial<AgentPermissions>>(json, {});
  return { canCreateAgents: parsed.canCreateAgents ?? false };
}

/** Validates `Authorization: Bearer <agent_api_key>`. */
export async function authenticateAgentRequest(
  request: Request,
): Promise<AuthenticatedAgent | null> {
  const token = readBearerToken(request);
  if (!token || !token.startsWith("aidos_agent_")) return null;

  const keyHash = hashAgentApiKey(token);

  const apiKey = await prisma.agentApiKey.findFirst({
    where: { keyHash, revokedAt: null },
    include: { agent: true },
  });

  if (!apiKey) return null;

  if (!keysMatch(keyHash, apiKey.keyHash)) return null;

  return {
    agent: apiKey.agent,
    organizationId: apiKey.organizationId,
    runtimeConfig: parseRuntimeConfig(apiKey.agent.runtimeConfigJson),
    permissions: parsePermissions(apiKey.agent.permissionsJson),
  };
}
