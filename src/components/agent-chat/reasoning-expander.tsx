"use client";

import { useState } from "react";
import type { ReasoningJson } from "@/lib/agent-chat/types";

export function ReasoningExpander({ reasoning }: { reasoning: ReasoningJson }) {
  const [open, setOpen] = useState(false);
  const hasThinking = reasoning.thinking.trim().length > 0;
  const hasTools = reasoning.tools.length > 0;

  if (!hasThinking && !hasTools) return null;

  return (
    <div className="mt-2 border-t border-border-subtle pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="text-xs text-graphite hover:text-ink"
      >
        {open ? "Hide reasoning" : "Show reasoning"}
      </button>
      {open && (
        <div className="mt-2 space-y-2 rounded-2xl bg-fog p-3 text-xs text-ash">
          {hasThinking && (
            <div>
              <p className="mb-1 font-medium text-graphite">Thinking</p>
              <p className="whitespace-pre-wrap">{reasoning.thinking}</p>
            </div>
          )}
          {hasTools && (
            <div>
              <p className="mb-1 font-medium text-graphite">Tool calls</p>
              <ul className="space-y-2">
                {reasoning.tools.map((tool, i) => (
                  <li key={`${tool.name}-${i}`} className="rounded-lg border border-border-subtle bg-pure-white p-2">
                    <p className="font-mono text-ink">{tool.name}</p>
                    {Object.keys(tool.input).length > 0 && (
                      <pre className="mt-1 overflow-x-auto text-[10px] text-graphite">
                        {JSON.stringify(tool.input, null, 2)}
                      </pre>
                    )}
                    {tool.outputPreview && (
                      <p className="mt-1 text-graphite">
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
