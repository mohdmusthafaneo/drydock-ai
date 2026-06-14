import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import type { AgentType } from "@/generated/prisma/client";
import { executeAidosAgentRun } from "./execute-agent";

const agentRunInputSchema = z.object({
  agentType: z.string(),
  systemPrompt: z.string(),
  userMessage: z.string(),
  streamEnabled: z.boolean().optional(),
});

const agentRunOutputSchema = z.object({
  summary: z.string(),
  inputTokens: z.number(),
  outputTokens: z.number(),
  mastraRunId: z.string().optional(),
  mastraTraceId: z.string().optional(),
});

const runAgentStep = createStep({
  id: "run-agent",
  description: "Execute the Mastra agent for a heartbeat wakeup",
  inputSchema: agentRunInputSchema,
  outputSchema: agentRunOutputSchema,
  execute: async ({ inputData, mastra, requestContext }) => {
    if (!inputData) {
      throw new Error("Heartbeat workflow missing input");
    }
    if (!mastra) {
      throw new Error("Mastra instance unavailable in heartbeat workflow");
    }

    const result = await executeAidosAgentRun({
      mastra,
      agentType: inputData.agentType as AgentType,
      systemPrompt: inputData.systemPrompt,
      userMessage: inputData.userMessage,
      requestContext,
      streamSession: null,
    });

    return result;
  },
});

const heartbeatWorkflow = createWorkflow({
  id: "heartbeat-workflow",
  inputSchema: agentRunInputSchema,
  outputSchema: agentRunOutputSchema,
}).then(runAgentStep);

heartbeatWorkflow.commit();

export { heartbeatWorkflow, agentRunInputSchema, agentRunOutputSchema };
