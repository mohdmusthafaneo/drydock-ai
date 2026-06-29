import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { assertNoBannedL1Terms } from "@/lib/executive-briefing/compose-briefing";
import {
  extractEmphasisTokens,
  resolveEnrichedHeadline,
} from "@/lib/executive-briefing/headline-format";
import { generateProductIntelligenceText, parseLlmJson } from "./llm-text";

const headlineSegmentSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("text"), text: z.string() }),
  z.object({ kind: z.literal("emphasis"), text: z.string() }),
]);

const briefingClaimSchema = z.object({
  id: z.string(),
  headline: z.string(),
  verdict: z.string(),
  verdictLabel: z.string(),
  context: z.string(),
  metric: z.string().optional(),
});

const executiveBriefingEnrichInputSchema = z.object({
  orgName: z.string(),
  deterministicHeadline: z.array(headlineSegmentSchema),
  narrative: z.string(),
  health: z.object({
    overall: z.number().nullable(),
    band: z.string().nullable(),
    bandLabel: z.string().nullable(),
    dataGaps: z.array(z.string()),
  }),
  claims: z.array(briefingClaimSchema),
  highlights: z.array(
    z.object({
      id: z.string(),
      value: z.string(),
    }),
  ),
  freshness: z.object({
    asOf: z.string(),
    stale: z.boolean(),
    staleSources: z.array(z.string()),
  }),
  factsJson: z.string(),
});

const executiveBriefingEnrichOutputSchema = z.object({
  headline: z.array(headlineSegmentSchema),
  narrative: z.string(),
  enriched: z.boolean(),
});

const enrichExecutiveBriefingStep = createStep({
  id: "enrich-executive-briefing",
  description: "LLM polish of executive dashboard L1 headline from structured facts",
  inputSchema: executiveBriefingEnrichInputSchema,
  outputSchema: executiveBriefingEnrichOutputSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error("Executive briefing enrich workflow missing input");
    }
    if (!mastra) {
      throw new Error("Mastra instance unavailable in executive briefing enrich workflow");
    }

    const fallback = {
      headline: inputData.deterministicHeadline,
      narrative: inputData.narrative,
      enriched: false,
    };

    const prompt = `You write executive dashboard headlines for AIDOS, a governance-aware operational intelligence platform.

Organization: ${inputData.orgName}

Structured facts (use ONLY these facts — do not invent numbers, release names, scores, or counts):
${inputData.factsJson}

Current deterministic headline segments:
${JSON.stringify(inputData.deterministicHeadline, null, 2)}

Current deterministic narrative:
${inputData.narrative}

Write a polished L1 executive headline for senior leadership.

Rules:
- Use only facts provided. Do not change any numbers, release names, or scores.
- Write in plain English for executives (no jargon).
- Never use these terms without translation: telemetry, heartbeat, autonomy mode, governance score, metricCount, agent IDs.
- When data is stale, mention that integration data may be outdated.
- When Jira hygiene degrades trust (jiraHygiene.degradesTrust in facts), mention that Jira board maintenance is poor and delivery numbers may be unreliable.
- When approvals are pending, mention how many need a decision.
- headline: ONE sentence, max 22 words, with proper spaces and punctuation (e.g. "at 32", not "at32").
- Do NOT return headline as an array of segments — return headline as a single string.
- Prefer the tone and structure of the deterministic headline; polish wording only, do not invent new facts.
- narrative: 2-4 complete sentences (80-120 words) for leadership context.

Respond with JSON only:
{
  "headline": "Connexus is in progress on Platform onboarding release — 50% ready to ship, delivery at risk.",
  "narrative": "..."
}`;

    const raw = await generateProductIntelligenceText(mastra, prompt);
    const parsed = parseLlmJson<{ headline?: unknown; narrative?: string }>(raw);
    if (!parsed?.narrative?.trim()) {
      return fallback;
    }

    const emphasisTokens = extractEmphasisTokens({
      health: inputData.health,
      highlights: inputData.highlights,
      claims: inputData.claims,
      deterministicHeadline: inputData.deterministicHeadline,
    });

    const resolved = resolveEnrichedHeadline({
      headlineFromLlm: parsed.headline,
      narrative: parsed.narrative,
      emphasisTokens,
      deterministicHeadline: inputData.deterministicHeadline,
    });

    if (!resolved.enriched) {
      return fallback;
    }

    const narrative = resolved.narrative.slice(0, 2000);

    try {
      assertNoBannedL1Terms(narrative);
      assertNoBannedL1Terms(
        resolved.headline.map((segment) => segment.text).join(" "),
      );
    } catch {
      return fallback;
    }

    return {
      headline: resolved.headline,
      narrative,
      enriched: true,
    };
  },
});

const executiveBriefingEnrichWorkflow = createWorkflow({
  id: "executive-briefing-enrich-workflow",
  inputSchema: executiveBriefingEnrichInputSchema,
  outputSchema: executiveBriefingEnrichOutputSchema,
}).then(enrichExecutiveBriefingStep);

executiveBriefingEnrichWorkflow.commit();

export {
  executiveBriefingEnrichWorkflow,
  executiveBriefingEnrichInputSchema,
  executiveBriefingEnrichOutputSchema,
};
