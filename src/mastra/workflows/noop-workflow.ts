import { createStep, createWorkflow } from "@mastra/core/workflows";
import { z } from "zod";

const passthrough = createStep({
  id: "passthrough",
  description: "No-op passthrough for M0 foundation verification",
  inputSchema: z.object({
    ok: z.boolean().optional(),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
  }),
  execute: async () => ({ ok: true }),
});

const noopWorkflow = createWorkflow({
  id: "noop-workflow",
  inputSchema: z.object({
    ok: z.boolean().optional(),
  }),
  outputSchema: z.object({
    ok: z.boolean(),
  }),
}).then(passthrough);

noopWorkflow.commit();

export { noopWorkflow };
