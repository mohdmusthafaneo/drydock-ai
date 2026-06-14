import { getMastra } from "./index";

let foundationReady: Promise<void> | null = null;

/** Run once per process — executes the noop workflow to validate Mastra wiring. */
export function ensureMastraFoundation(): Promise<void> {
  if (!foundationReady) {
    foundationReady = verifyMastraFoundation();
  }
  return foundationReady;
}

async function verifyMastraFoundation(): Promise<void> {
  const mastra = await getMastra();
  const workflow = mastra.getWorkflow("noopWorkflow");
  const run = await workflow.createRun();
  const result = await run.start({ inputData: {} });

  if (result.status !== "success") {
    throw new Error(
      `Mastra noop workflow failed with status: ${result.status}`,
    );
  }
}
