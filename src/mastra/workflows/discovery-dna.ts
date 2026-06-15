import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import type { GeneratedDeliveryDNA } from "@/lib/delivery-dna";
import { generateProductIntelligenceText, parseLlmJson } from "./llm-text";

const discoveryAnswersSchema = z.object({
  organizationName: z.string(),
  industryType: z.string(),
  teamSize: z.string(),
  sdlcMaturity: z.number(),
  devopsMaturity: z.number(),
  governanceLevel: z.number(),
  complianceType: z.string(),
  deploymentStrategy: z.string(),
  tools: z.array(z.string()),
  workflows: z.array(z.string()),
});

const deterministicDnaSchema = z.object({
  workflowMode: z.string(),
  approvalLevel: z.number(),
  riskThreshold: z.number(),
  autonomyMode: z.enum(["OBSERVE", "RECOMMEND", "ASSIST"]),
  autonomyLevel: z.number(),
  governanceScore: z.number(),
  escalationMatrix: z.record(z.string(), z.string()),
  observabilityStrategy: z.string(),
  summary: z.string(),
});

const discoveryDnaInputSchema = z.object({
  answers: discoveryAnswersSchema,
  deterministicDna: deterministicDnaSchema,
});

const discoveryDnaOutputSchema = deterministicDnaSchema.extend({
  llmRationale: z.string().optional(),
});

const enrichDiscoveryDnaStep = createStep({
  id: "enrich-discovery-dna",
  description:
    "Optional LLM enrichment of Delivery DNA executive summary and rationale",
  inputSchema: discoveryDnaInputSchema,
  outputSchema: discoveryDnaOutputSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error("Discovery DNA workflow missing input");
    }
    if (!mastra) {
      throw new Error("Mastra instance unavailable in discovery DNA workflow");
    }

    const { answers, deterministicDna } = inputData;

    const prompt = `You enrich AIDOS Delivery DNA narratives for enterprise governance.

Discovery answers:
${JSON.stringify(answers, null, 2)}

Deterministic Delivery DNA (preserve all numeric fields and modes — only enrich narrative):
${JSON.stringify(deterministicDna, null, 2)}

Write:
1. "summary" — 2-3 sentence executive summary replacing the template summary
2. "llmRationale" — 2-4 bullet points explaining autonomy/governance posture

Respond with JSON only: { "summary": "...", "llmRationale": "..." }`;

    const raw = await generateProductIntelligenceText(mastra, prompt);
    const parsed = parseLlmJson<{ summary?: string; llmRationale?: string }>(raw);

    if (!parsed?.summary?.trim()) {
      return { ...deterministicDna };
    }

    return {
      ...deterministicDna,
      summary: parsed.summary.trim().slice(0, 2000),
      ...(parsed.llmRationale?.trim()
        ? { llmRationale: parsed.llmRationale.trim().slice(0, 4000) }
        : {}),
    };
  },
});

const discoveryDnaWorkflow = createWorkflow({
  id: "discovery-dna-workflow",
  inputSchema: discoveryDnaInputSchema,
  outputSchema: discoveryDnaOutputSchema,
}).then(enrichDiscoveryDnaStep);

discoveryDnaWorkflow.commit();

export {
  discoveryDnaWorkflow,
  discoveryDnaInputSchema,
  discoveryDnaOutputSchema,
};
export type { GeneratedDeliveryDNA };