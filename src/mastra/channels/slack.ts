import { createSlackAdapter } from "@chat-adapter/slack";
import type { ChannelConfig } from "@mastra/core/channels";

import { getSlackInstallationForAdapter } from "@/lib/slack/tenant";

/**
 * Build Slack channel config for the AIDOS assistant.
 * Returns null when Slack is not configured or when running as the worker
 * process / Mastra Studio (avoid starting channel machinery there).
 *
 * Reads Slack env vars directly (no getAppUrl) so this is safe to call at
 * module init during `next build` when NEXT_PUBLIC_APP_URL is unset.
 */
export function buildAidosSlackChannelConfig(): ChannelConfig | null {
  const role =
    process.env.DRYDOCK_PROCESS_ROLE?.trim() ||
    process.env.AIDOS_PROCESS_ROLE?.trim() ||
    "web";
  // Worker and Studio should not own Slack webhooks / Chat SDK init.
  if (role === "worker") return null;
  if (process.env.MASTRA_STUDIO === "1" || process.env.MASTRA_DEV === "1") {
    return null;
  }

  const clientId = process.env.SLACK_CLIENT_ID;
  const clientSecret = process.env.SLACK_CLIENT_SECRET;
  const signingSecret = process.env.SLACK_SIGNING_SECRET;
  if (!clientId || !clientSecret || !signingSecret) {
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
