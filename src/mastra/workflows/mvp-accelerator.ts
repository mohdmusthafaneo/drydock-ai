import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import type {
  DeliveryDNA,
  Organization,
  OrganizationProfile,
} from "@/generated/prisma/client";
import { generateMvpAccelerator } from "@/lib/mvp-accelerator";
import { generateProductIntelligenceText } from "./llm-text";

const acceleratorInputSchema = z.object({
  title: z.string(),
  idea: z.string(),
  targetUser: z.string().optional(),
  problemStatement: z.string().optional(),
});

const mvpAcceleratorInputSchema = z.object({
  projectId: z.string(),
  organizationId: z.string(),
  orgName: z.string(),
  workflowMode: z.string(),
  teamSize: z.string(),
  deployStrategy: z.string(),
  input: acceleratorInputSchema,
});

const withPrdSchema = mvpAcceleratorInputSchema.extend({
  prdMarkdown: z.string(),
});

const withArchitectureSchema = withPrdSchema.extend({
  architectureMarkdown: z.string(),
});

const mvpAcceleratorOutputSchema = z.object({
  prdMarkdown: z.string(),
  architectureMarkdown: z.string(),
  featuresJson: z.string(),
  jiraEpicsJson: z.string(),
  qaPlanMarkdown: z.string(),
  deploymentPlanMarkdown: z.string(),
  roadmapJson: z.string(),
});

const stepApprovalResumeSchema = z.object({
  approved: z.boolean(),
});

const stepApprovalSuspendSchema = z.object({
  step: z.enum(["PRD", "ARCHITECTURE"]),
  projectId: z.string(),
  message: z.string(),
});

const generatePrdStep = createStep({
  id: "generate-prd",
  description: "LLM-generate PRD markdown from accelerator idea",
  inputSchema: mvpAcceleratorInputSchema,
  outputSchema: withPrdSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData || !mastra) {
      throw new Error("MVP accelerator PRD step missing context");
    }

    const { input, orgName, workflowMode, teamSize } = inputData;
    const prompt = `Write a concise MVP PRD in Markdown for AIDOS governance-aware delivery.

Organization: ${orgName}
Workflow mode: ${workflowMode}
Team size: ${teamSize}
Title: ${input.title}
Idea: ${input.idea}
Target user: ${input.targetUser ?? "TBD"}
Problem: ${input.problemStatement ?? "TBD"}

Include: goals, non-goals, user stories (3-5), success metrics, governance/approval notes.
Return Markdown only — no JSON wrapper.`;

    const prdMarkdown = await generateProductIntelligenceText(mastra, prompt);
    if (!prdMarkdown) {
      throw new Error("LLM did not return PRD content");
    }

    return { ...inputData, prdMarkdown };
  },
});

const waitPrdApprovalStep = createStep({
  id: "wait-prd-approval",
  description: "Suspend until human approves PRD step",
  inputSchema: withPrdSchema,
  outputSchema: withPrdSchema,
  resumeSchema: stepApprovalResumeSchema,
  suspendSchema: stepApprovalSuspendSchema,
  execute: async ({ inputData, resumeData, suspend, bail }) => {
    if (!inputData) {
      throw new Error("PRD approval step missing input");
    }

    if (!resumeData) {
      return suspend({
        step: "PRD",
        projectId: inputData.projectId,
        message: "Review the generated PRD before continuing to architecture",
      });
    }

    if (!resumeData.approved) {
      return bail(inputData);
    }

    return inputData;
  },
});

const generateArchitectureStep = createStep({
  id: "generate-architecture",
  description: "LLM-generate architecture markdown from approved PRD",
  inputSchema: withPrdSchema,
  outputSchema: withArchitectureSchema,
  execute: async ({ inputData, mastra }) => {
    if (!inputData || !mastra) {
      throw new Error("MVP accelerator architecture step missing context");
    }

    const prompt = `Write a concise system architecture document in Markdown aligned with this PRD and governance posture.

Deploy strategy: ${inputData.deployStrategy}
Workflow mode: ${inputData.workflowMode}

PRD:
${inputData.prdMarkdown.slice(0, 6000)}

Include: components, data flow, integrations, observability, approval gates.
Return Markdown only.`;

    const architectureMarkdown = await generateProductIntelligenceText(
      mastra,
      prompt,
    );
    if (!architectureMarkdown) {
      throw new Error("LLM did not return architecture content");
    }

    return { ...inputData, architectureMarkdown };
  },
});

const waitArchitectureApprovalStep = createStep({
  id: "wait-architecture-approval",
  description: "Suspend until human approves architecture step",
  inputSchema: withArchitectureSchema,
  outputSchema: withArchitectureSchema,
  resumeSchema: stepApprovalResumeSchema,
  suspendSchema: stepApprovalSuspendSchema,
  execute: async ({ inputData, resumeData, suspend, bail }) => {
    if (!inputData) {
      throw new Error("Architecture approval step missing input");
    }

    if (!resumeData) {
      return suspend({
        step: "ARCHITECTURE",
        projectId: inputData.projectId,
        message:
          "Review the generated architecture before continuing to features and epics",
      });
    }

    if (!resumeData.approved) {
      return bail(inputData);
    }

    return inputData;
  },
});

const generateFinalArtifactsStep = createStep({
  id: "generate-final-artifacts",
  description:
    "Merge LLM PRD/architecture with deterministic features, epics, and plans",
  inputSchema: withArchitectureSchema,
  outputSchema: mvpAcceleratorOutputSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error("Final artifacts step missing input");
    }

    const deterministic = generateMvpAccelerator({
      org: {
        id: inputData.organizationId,
        name: inputData.orgName,
      } as Organization,
      profile: {
        teamSize: inputData.teamSize,
        deploymentStrategy: inputData.deployStrategy,
      } as OrganizationProfile,
      dna: {
        workflowMode: inputData.workflowMode,
      } as DeliveryDNA,
      input: inputData.input,
    });

    return {
      prdMarkdown: inputData.prdMarkdown,
      architectureMarkdown: inputData.architectureMarkdown,
      featuresJson: JSON.stringify(deterministic.features),
      jiraEpicsJson: JSON.stringify(deterministic.jiraEpics),
      qaPlanMarkdown: deterministic.qaPlanMarkdown,
      deploymentPlanMarkdown: deterministic.deploymentPlanMarkdown,
      roadmapJson: JSON.stringify(deterministic.roadmap),
    };
  },
});

const mvpAcceleratorWorkflow = createWorkflow({
  id: "mvp-accelerator-workflow",
  inputSchema: mvpAcceleratorInputSchema,
  outputSchema: mvpAcceleratorOutputSchema,
})
  .then(generatePrdStep)
  .then(waitPrdApprovalStep)
  .then(generateArchitectureStep)
  .then(waitArchitectureApprovalStep)
  .then(generateFinalArtifactsStep);

mvpAcceleratorWorkflow.commit();

export {
  mvpAcceleratorWorkflow,
  mvpAcceleratorInputSchema,
  mvpAcceleratorOutputSchema,
  stepApprovalSuspendSchema,
  waitPrdApprovalStep,
  waitArchitectureApprovalStep,
};
