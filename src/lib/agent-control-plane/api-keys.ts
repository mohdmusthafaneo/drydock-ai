import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import {
  generateAgentApiKey,
  hashAgentApiKey,
} from "@/lib/agent-control-plane/agent-auth";

type Tx = Prisma.TransactionClient;

/** Create an API key for an agent if none exists. Returns plaintext key only when created. */
export async function ensureAgentApiKey(
  tx: Tx,
  organizationId: string,
  agentId: string,
  label = "default",
): Promise<string | null> {
  const existing = await tx.agentApiKey.findFirst({
    where: { agentId, revokedAt: null },
  });
  if (existing) return null;

  const plaintext = generateAgentApiKey();
  await tx.agentApiKey.create({
    data: {
      organizationId,
      agentId,
      keyHash: hashAgentApiKey(plaintext),
      label,
    },
  });

  return plaintext;
}

/** Short-lived key for in-process adapter → agent API calls during a heartbeat run. */
export async function createEphemeralRunApiKey(
  organizationId: string,
  agentId: string,
  runId: string,
): Promise<string> {
  const plaintext = generateAgentApiKey();
  await prisma.agentApiKey.create({
    data: {
      organizationId,
      agentId,
      keyHash: hashAgentApiKey(plaintext),
      label: `heartbeat-run:${runId}`,
    },
  });
  return plaintext;
}

export async function revokeEphemeralRunApiKey(runId: string): Promise<void> {
  await prisma.agentApiKey.updateMany({
    where: { label: `heartbeat-run:${runId}`, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
