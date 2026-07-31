import type { Mastra } from "@mastra/core/mastra";

/** Run a single-turn prompt on the product intelligence agent. */
export async function generateProductIntelligenceText(
  mastra: Mastra,
  prompt: string,
): Promise<string> {
  const agent = mastra.getAgent("productIntelligenceAgent");
  if (!agent) {
    throw new Error("productIntelligenceAgent is not registered");
  }

  const output = await agent.generate(prompt, { maxSteps: 1 });

  return (output.text ?? "").trim();
}

/** Parse JSON from an LLM response, tolerating fenced code blocks. */
export function parseLlmJson<T>(text: string): T | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? trimmed).trim();

  try {
    return JSON.parse(candidate) as T;
  } catch {
    return null;
  }
}
