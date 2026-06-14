import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import type { AgentType, AgentWakeupSource } from "@/generated/prisma/client";
import { executeAidosAgentRun } from "./execute-agent";
import {
  augmentUserMessageForRouting,
  resolveChatRoutingMode,
} from "./wake-message";
import { agentRunOutputSchema } from "./heartbeat";

const chatRoutingInputSchema = z.object({
  agentType: z.string(),
  source: z.string(),
  reason: z.string(),
  systemPrompt: z.string(),
  userMessage: z.string(),
  streamEnabled: z.boolean().optional(),
});

const routeChatStep = createStep({
  id: "route-chat",
  description:
    "Branch chat wakeups on Super coordinator vs specialist direct vs delegation",
  inputSchema: chatRoutingInputSchema,
  outputSchema: agentRunOutputSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    if (!inputData) {
      throw new Error("Chat routing workflow missing input");
    }
    if (!mastra) {
      throw new Error("Mastra instance unavailable in chat routing workflow");
    }

    const mode = resolveChatRoutingMode({
      agentType: inputData.agentType,
      source: inputData.source as AgentWakeupSource,
      reason: inputData.reason,
    });

    const userMessage = augmentUserMessageForRouting(
      inputData.userMessage,
      mode,
    );

    const result = await executeAidosAgentRun({
      mastra,
      agentType: inputData.agentType as AgentType,
      systemPrompt: inputData.systemPrompt,
      userMessage,
      requestContext,
      streamSession: null,
    });

    return result;
  },
});

const chatRoutingWorkflow = createWorkflow({
  id: "chat-routing-workflow",
  inputSchema: chatRoutingInputSchema,
  outputSchema: agentRunOutputSchema,
}).then(routeChatStep);

chatRoutingWorkflow.commit();

export { chatRoutingWorkflow, chatRoutingInputSchema };
