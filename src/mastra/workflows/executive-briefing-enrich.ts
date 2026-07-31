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
  description:
    "LLM diagnostic polish of executive dashboard L1 narrative from structured delivery facts",
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

    const prompt = `You write executive dashboard briefings for AIDOS, a governance-aware operational intelligence platform.

Organization: ${inputData.orgName}

Structured facts (use ONLY these facts — do not invent numbers, release names, scores, or counts):
${inputData.factsJson}

Current deterministic headline segments:
${JSON.stringify(inputData.deterministicHeadline, null, 2)}

Current deterministic diagnostic narrative (baseline — improve clarity and flow, keep the same judgment):
${inputData.narrative}

Write a polished L1 executive briefing for senior leadership.

Rules:
- Use only facts provided. Do not change any numbers, release names, or scores.
- Write in plain English for executives (no jargon).
- Never use these terms without translation: telemetry, heartbeat, autonomy mode, governance score, metricCount, agent IDs.
- Prefer a COMPACT DIAGNOSTIC narrative. Exactly 2 sentences (hard max 3). Target 45–70 words (hard cap 80).
  Structure:
  1) Crisis check + top shape issue(s) — blocked / unassigned / overdue, or explicitly NOT in crisis; then throughput / bugs / scope pull-in (at most two shape points).
  2) Trajectory — if nothing changes → completion % and spillover/carryover when present.
- Do NOT include bus-factor, contributor names, stale sync, or Jira hygiene in the narrative (those live elsewhere on the page).
- Tone example (adapt to facts; do not copy numbers from the example):
  "The sprint is not in crisis (nothing blocked or overdue), but the shape is bad: too little getting done and a heavy bug load (12 in sprint, 203 overall). If nothing changes, expect ~30% finish with growing spillover (21 carried)."
- When approvals are pending, fold into sentence 2 only if under the word cap — otherwise omit.
- headline: ONE sentence, max 22 words, with proper spaces and punctuation (e.g. "at 32", not "at32"). Summarize the posture (e.g. completion % + delivery risk), not the full diagnosis.
- Do NOT return headline as an array of segments — return headline as a single string.
- Keep the diagnostic judgment from the deterministic baseline unless facts clearly contradict it.
- If delivery.diagnostic is present, ground crisis/shape/trajectory language in those fields.

Respond with JSON only:
{
  "headline": "Connexus Sprint 37 — 30% complete, delivery at risk.",
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
