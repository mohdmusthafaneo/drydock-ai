import { createSlackAdapter } from "@chat-adapter/slack";
import type { ChannelConfig } from "@mastra/core/channels";

import { getSlackOAuthConfig } from "@/lib/slack-oauth";
import { getSlackInstallationForAdapter } from "@/lib/slack/tenant";

/**
 * Build Slack channel config for the AIDOS assistant.
 * Returns null when Slack is not configured or when running as the worker
 * process / Mastra Studio (avoid starting channel machinery there).
 */
export function buildAidosSlackChannelConfig(): ChannelConfig | null {
  const role = process.env.AIDOS_PROCESS_ROLE ?? "web";
  // Worker and Studio should not own Slack webhooks / Chat SDK init.
  if (role === "worker") return null;
  if (process.env.MASTRA_STUDIO === "1" || process.env.MASTRA_DEV === "1") {
    return null;
  }

  const { clientId, clientSecret, signingSecret, configured } = getSlackOAuthConfig();
  if (!configured || !clientId || !clientSecret || !signingSecret) {
    return null;
  }

  const adapter = createSlackAdapter({
    clientId,
    clientSecret,
    signingSecret,
    installationProvider: {
      getInstallation: getSlackInstallationForAdapter,
    },
  });

  return {
    userName: "AIDOS",
    tools: false,
    threadContext: { maxMessages: 10 },
    adapters: {
      slack: {
        adapter,
        gateway: false,
        streaming: false,
        toolDisplay: "hidden",
      },
    },
    handlers: {
      // Bypass Mastra's default agent.stream path — AIDOS owns org scoping,
      // RBAC, persistence, and audit via runSlackAssistantTurn.
      // Dynamic import avoids circular deps with aidos-assistant ↔ channels.
      onMention: async (thread, message, _defaultHandler) => {
        const { runSlackAssistantTurn } = await import("@/lib/slack/run-turn");
        await runSlackAssistantTurn(thread, message);
      },
      onDirectMessage: async (thread, message, _defaultHandler) => {
        const { runSlackAssistantTurn } = await import("@/lib/slack/run-turn");
        await runSlackAssistantTurn(thread, message);
      },
    },
  };
}
