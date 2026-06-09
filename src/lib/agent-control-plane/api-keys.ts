import type { Prisma } from "@/generated/prisma/client";
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
