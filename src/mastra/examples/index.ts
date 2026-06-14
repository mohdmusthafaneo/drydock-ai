/**
 * Mastra Studio entry — not imported by the Next.js app.
 * `mastra dev -d src/mastra/examples` bundles this file (top-level await is fine here).
 */
import { createMastraInstance } from "../server";

export const mastra = createMastraInstance({ includeExamples: true });
