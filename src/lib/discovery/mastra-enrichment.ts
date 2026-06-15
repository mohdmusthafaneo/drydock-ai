import type {
  DiscoveryAnswers,
  GeneratedDeliveryDNA,
} from "@/lib/delivery-dna";
import { getMastra } from "@/mastra";

export type EnrichedDeliveryDNA = GeneratedDeliveryDNA & {
  llmRationale?: string;
};

/** Run discovery DNA Mastra workflow to enrich summary/rationale (deterministic core unchanged). */
export async function enrichDeliveryDnaWithMastra(input: {
  answers: DiscoveryAnswers;
  deterministicDna: GeneratedDeliveryDNA;
}): Promise<EnrichedDeliveryDNA> {
  const mastra = await getMastra();
  const workflow = mastra.getWorkflow("discoveryDnaWorkflow");
  const run = await workflow.createRun();
  const result = await run.start({
    inputData: {
      answers: input.answers,
      deterministicDna: input.deterministicDna,
    },
  });

  if (result.status !== "success" || !result.result) {
    throw new Error(`Discovery DNA workflow failed: ${result.status}`);
  }

  return result.result as EnrichedDeliveryDNA;
}
