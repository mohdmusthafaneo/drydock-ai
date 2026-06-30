import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import type { CalibrationObservations, CalibratedWorkflowProfile } from "@/lib/jira-calibration/types";
import { generateProductIntelligenceText, parseLlmJson } from "./llm-text";

const hygieneBaselinesSchema = z.object({
  unassignedRatioP50: z.number(),
  overdueRatioP50: z.number(),
  missingEstimateRatioP50: z.number().optional(),
});

const jiraCalibrationInputSchema = z.object({
  orgName: z.string(),
  projectKey: z.string(),
  observations: z.custom<CalibrationObservations>(),
  schemaSnapshotJson: z.string().optional(),
  workflowsJson: z.string().optional(),
  mappingJson: z.string().optional(),
  factsJson: z.string(),
});

const calibratedProfileSchema = z.object({
  methodology: z.enum(["scrum", "kanban", "mixed", "custom"]),
  usesSprints: z.boolean(),
  releaseTracking: z.enum(["fixVersion", "sprint", "labels", "none"]),
  blockedStatusName: z.string(),
  doneStatusNames: z.array(z.string()).min(1),
  doneStatusCategory: z.enum(["Done", "Complete", "Closed"]),
  bugIssueType: z.string().optional(),
  hygieneBaselines: hygieneBaselinesSchema,
  rationale: z.string().optional(),
  confidence: z.enum(["high", "medium", "low"]),
});

const jiraCalibrationOutputSchema = z.object({
  profile: calibratedProfileSchema,
  enriched: z.boolean(),
  rationale: z.string().optional(),
});

const calibrateJiraWorkflowStep = createStep({
  id: "calibrate-jira-workflow",
  description: "LLM refinement of Jira workflow model from 90-day observations",
  inputSchema: jiraCalibrationInputSchema,
  outputSchema: jiraCalibrationOutputSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData) {
      throw new Error("Jira calibration workflow missing input");
    }
    if (!mastra) {
      throw new Error("Mastra instance unavailable in jira calibration workflow");
    }

    const deterministic: CalibratedWorkflowProfile = {
      methodology: inputData.observations.methodology,
      usesSprints: inputData.observations.sprintCadence?.usesSprints ?? false,
      releaseTracking: inputData.observations.releaseTrackingEvidence.suggestedMode,
      blockedStatusName: inputData.observations.inferredBlockedStatusName,
      doneStatusNames: inputData.observations.inferredDoneStatusNames,
      doneStatusCategory: "Done",
      hygieneBaselines: inputData.observations.hygieneBaselines,
      confidence: inputData.observations.confidence,
    };

    const fallback = {
      profile: calibratedProfileSchema.parse(deterministic),
      enriched: false,
      rationale: undefined,
    };

    const prompt = `You calibrate Jira workflow semantics for AIDOS operational intelligence.

Organization: ${inputData.orgName}
Project: ${inputData.projectKey}

Use ONLY the structured facts below. Do not invent statuses, fields, or metrics.

Facts:
${inputData.factsJson}

Deterministic observations (from 90-day transition analysis):
${JSON.stringify(inputData.observations, null, 2)}

Current toolchain mapping (if any):
${inputData.mappingJson ?? "{}"}

Discovery self-reported workflows:
${inputData.workflowsJson ?? "[]"}

Jira schema snapshot:
${inputData.schemaSnapshotJson ?? "{}"}

Produce a workflow profile JSON that leadership can trust for hygiene and delivery signals.

Rules:
- doneStatusNames must reflect how this team actually closes work (from transitions).
- blockedStatusName must match observed blocked/waiting statuses when present.
- releaseTracking must match observed fixVersion/label/sprint usage.
- hygieneBaselines must stay aligned with observed P50 ratios (do not change by more than 0.15).
- confidence: high only when observations.confidence is high and done statuses are unambiguous.
- rationale: 2-3 sentences explaining key choices for a delivery lead.

Respond with JSON only:
{
  "methodology": "scrum",
  "usesSprints": true,
  "releaseTracking": "fixVersion",
  "blockedStatusName": "Blocked",
  "doneStatusNames": ["Done", "Closed"],
  "doneStatusCategory": "Done",
  "bugIssueType": "Bug",
  "hygieneBaselines": { "unassignedRatioP50": 0.1, "overdueRatioP50": 0.05 },
  "confidence": "medium",
  "rationale": "..."
}`;

    const raw = await generateProductIntelligenceText(mastra, prompt);
    const parsed = parseLlmJson<Record<string, unknown>>(raw);
    if (!parsed) return fallback;

    const validated = calibratedProfileSchema.safeParse(parsed);
    if (!validated.success) return fallback;

    return {
      profile: validated.data,
      enriched: true,
      rationale: validated.data.rationale,
    };
  },
});

const jiraCalibrationWorkflow = createWorkflow({
  id: "jira-calibration-workflow",
  inputSchema: jiraCalibrationInputSchema,
  outputSchema: jiraCalibrationOutputSchema,
}).then(calibrateJiraWorkflowStep);

jiraCalibrationWorkflow.commit();

export {
  jiraCalibrationWorkflow,
  jiraCalibrationInputSchema,
  jiraCalibrationOutputSchema,
  calibratedProfileSchema,
};
