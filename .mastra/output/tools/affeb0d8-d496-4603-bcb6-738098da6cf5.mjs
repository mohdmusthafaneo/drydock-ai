import { createTool } from '@mastra/core/tools';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path__default from 'node:path';
import { S as SHARED_WORKSPACE_ROOT, r as resolveMastraDir } from '../workspace.mjs';
import 'node:fs';
import '@mastra/core/workspace';

const SCRIPT_RELATIVE = path__default.join(
  "skills",
  "analyze-git",
  "scripts",
  "analyze_git.py"
);
const DEST_RELATIVE = path__default.join("tools", "analyze_git.py");
function skillScriptAbsolutePath() {
  return path__default.join(resolveMastraDir(), SCRIPT_RELATIVE);
}
const materializeAnalyzeGitTool = createTool({
  id: "materialize-analyze-git",
  description: "Copy the analyze-git Python analyzer into the workspace at tools/analyze_git.py. Prefer this over skill_read + mastra_workspace_write_file \u2014 never paste the script body through the model.",
  inputSchema: z.object({}),
  outputSchema: z.object({
    path: z.string(),
    bytes: z.number()
  }),
  execute: async () => {
    const src = skillScriptAbsolutePath();
    const destDir = path__default.join(SHARED_WORKSPACE_ROOT, "tools");
    const dest = path__default.join(destDir, "analyze_git.py");
    const content = await fs.readFile(src);
    await fs.mkdir(destDir, { recursive: true });
    await fs.writeFile(dest, content);
    return {
      path: DEST_RELATIVE,
      bytes: content.byteLength
    };
  }
});

export { materializeAnalyzeGitTool };
