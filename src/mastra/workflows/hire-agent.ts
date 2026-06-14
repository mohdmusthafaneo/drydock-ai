import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

import { agentJson } from "../tools/aidos/client";
import { getAidosToolContext } from "../tools/aidos/context";

const hireInputSchema = z.object({
  displayName: z.string(),
  role: z.string(),
  reportsToAgentId: z.string().optional(),
  capabilities: z.string().optional(),
  instructionsBundle: z.object({
    files: z.record(z.string(), z.string()),
  }),
  desiredSkills: z.array(z.string()).optional(),
});

const hireValidatedSchema = hireInputSchema.extend({
  agentsMdPreview: z.string(),
});

const hireSubmittedSchema = hireValidatedSchema.extend({
  agentId: z.string(),
  approvalId: z.string().optional(),
  status: z.string(),
});

const validateHireStep = createStep({
  id: "validate-hire",
  description: "Validate hire payload and draft instruction preview",
  inputSchema: hireInputSchema,
  outputSchema: hireValidatedSchema,
  execute: async ({ inputData }) => {
    if (!inputData) {
      throw new Error("Hire workflow missing input");
    }

    const agentsMd = inputData.instructionsBundle.files["AGENTS.md"]?.trim();
    if (!agentsMd) {
      throw new Error("instructionsBundle.files.AGENTS.md is required");
    }

    return {
      ...inputData,
      agentsMdPreview: agentsMd.slice(0, 500),
    };
  },
});

const submitHireStep = createStep({
  id: "submit-hire",
  description: "Submit hire request via governed AIDOS API",
  inputSchema: hireValidatedSchema,
  outputSchema: hireSubmittedSchema,
  execute: async ({ inputData, requestContext }) => {
    if (!inputData) {
      throw new Error("Hire submit step missing input");
    }

    const ctx = getAidosToolContext({ requestContext });
    const response = await agentJson(ctx, "/api/agents/hire", {
      method: "POST",
      body: JSON.stringify({
        displayName: inputData.displayName,
        role: inputData.role,
        reportsToAgentId: inputData.reportsToAgentId,
        capabilities: inputData.capabilities,
        instructionsBundle: inputData.instructionsBundle,
        desiredSkills: inputData.desiredSkills,
        adapterType: "mastra",
      }),
    });

    const parsed = response as {
      agentId?: string;
      approvalId?: string;
      status?: string;
    };

    if (!parsed.agentId) {
      throw new Error("Hire API did not return agentId");
    }

    return {
      ...inputData,
      agentId: parsed.agentId,
      approvalId: parsed.approvalId,
      status: parsed.status ?? "submitted",
    };
  },
});

const waitForApprovalStep = createStep({
  id: "wait-for-approval",
  description: "Suspend until human approval decision resumes the workflow",
  inputSchema: hireSubmittedSchema,
  outputSchema: z.object({
    agentId: z.string(),
    approvalId: z.string().optional(),
    decision: z.string().optional(),
    status: z.string(),
  }),
  resumeSchema: z.object({
    decision: z.enum(["approved", "rejected"]),
    approvalId: z.string().optional(),
  }),
  suspendSchema: z.object({
    agentId: z.string(),
    approvalId: z.string().optional(),
    message: z.string(),
  }),
  execute: async ({ inputData, resumeData, suspend }) => {
    if (!inputData) {
      throw new Error("Wait-for-approval step missing input");
    }

    if (!resumeData) {
      return suspend({
        agentId: inputData.agentId,
        approvalId: inputData.approvalId,
        message: "Awaiting human approval for agent hire",
      });
    }

    return {
      agentId: inputData.agentId,
      approvalId: resumeData.approvalId ?? inputData.approvalId,
      decision: resumeData.decision,
      status:
        resumeData.decision === "approved" ? "approved" : "rejected",
    };
  },
});

const hireAgentWorkflow = createWorkflow({
  id: "hire-agent-workflow",
  inputSchema: hireInputSchema,
  outputSchema: z.object({
    agentId: z.string(),
    approvalId: z.string().optional(),
    decision: z.string().optional(),
    status: z.string(),
  }),
})
  .then(validateHireStep)
  .then(submitHireStep)
  .then(waitForApprovalStep);

hireAgentWorkflow.commit();

export { hireAgentWorkflow };
