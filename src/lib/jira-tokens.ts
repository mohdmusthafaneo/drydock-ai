import { decryptToken } from "@/lib/token-crypto";
import { parseJiraMeta } from "@/lib/jira-meta";
import type { Integration } from "@/generated/prisma/client";

export function getJiraAccessToken(integration: Integration): string | null {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.accessTokenEnc) return null;
  try {
    return decryptToken(meta.accessTokenEnc);
  } catch {
    return null;
  }
}

export function getJiraRefreshToken(integration: Integration): string | null {
  const meta = parseJiraMeta(integration.metadataJson);
  if (!meta.refreshTokenEnc) return null;
  try {
    return decryptToken(meta.refreshTokenEnc);
  } catch {
    return null;
  }
}
