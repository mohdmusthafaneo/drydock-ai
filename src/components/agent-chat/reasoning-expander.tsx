"use client";

import { useState } from "react";
import type { ReasoningJson } from "@/lib/agent-chat/types";

export function ReasoningExpander({ reasoning }: { reasoning: ReasoningJson }) {
  const [open, setOpen] = useState(false);
  const hasThinking = reasoning.thinking.trim().length > 0;
  const hasTools = reasoning.tools.length > 0;

  if (!hasThinking && !hasTools) return null;

  return (
    <div className="mt-2 border-t border-white/5 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-slate-500 hover:text-slate-300"
      >
        {open ? "Hide reasoning" : "Show reasoning"}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-lg bg-[#0B1020]/60 p-3 text-xs text-slate-400">
          {hasThinking && (
            <div>
              <p className="mb-1 font-medium text-slate-500">Thinking</p>
              <p className="whitespace-pre-wrap">{reasoning.thinking}</p>
            </div>
          )}
          {hasTools && (
            <div>
              <p className="mb-1 font-medium text-slate-500">Tool calls</p>
              <ul className="space-y-2">
                {reasoning.tools.map((tool, i) => (
                  <li key={`${tool.name}-${i}`} className="rounded border border-white/5 p-2">
                    <p className="font-mono text-slate-300">{tool.name}</p>
                    {Object.keys(tool.input).length > 0 && (
                      <pre className="mt-1 overflow-x-auto text-[10px] text-slate-500">
                        {JSON.stringify(tool.input, null, 2)}
                      </pre>
                    )}
                    {tool.outputPreview && (
                      <p className="mt-1 text-slate-500">
                        → {tool.outputPreview.slice(0, 300)}
                        {tool.outputPreview.length > 300 ? "…" : ""}
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
