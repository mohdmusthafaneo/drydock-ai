import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import fs from "node:fs/promises";
import path from "node:path";
import { resolveMastraDir, SHARED_WORKSPACE_ROOT } from "../workspace";

/**
 * Copies analyze-git's Python analyzer into the sandbox without the LLM
 * re-emitting the file body (which blows MiniMax's output token cap).
 */
const SCRIPT_RELATIVE = path.join(
  "skills",
  "analyze-git",
  "scripts",
  "analyze_git.py",
);
const DEST_RELATIVE = path.join("tools", "analyze_git.py");

function skillScriptAbsolutePath(): string {
  return path.join(resolveMastraDir(), SCRIPT_RELATIVE);
}

export const materializeAnalyzeGitTool = createTool({
  id: "materialize-analyze-git",
  description:
    "Copy the analyze-git Python analyzer into the workspace at tools/analyze_git.py. Prefer this over skill_read + mastra_workspace_write_file — never paste the script body through the model.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    path: z.string(),
    bytes: z.number(),
  }),
  execute: async () => {
    const src = skillScriptAbsolutePath();
    const destDir = path.join(SHARED_WORKSPACE_ROOT, "tools");
    const dest = path.join(destDir, "analyze_git.py");

    const content = await fs.readFile(src);
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(dest, content);

    return {
      path: DEST_RELATIVE,
      bytes: content.byteLength,
    };
  },
});
