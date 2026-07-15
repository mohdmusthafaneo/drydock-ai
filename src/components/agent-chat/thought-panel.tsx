"use client";

import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/prompt-kit/reasoning";
import { Markdown } from "@/components/prompt-kit/markdown";
import { TextShimmer } from "@/components/prompt-kit/text-shimmer";
import { Tool, type ToolPart } from "@/components/prompt-kit/tool";
import { humanizeToolName } from "@/lib/agent-chat/thought-stream";
import type { ReasoningJson } from "@/lib/agent-chat/types";

export type ThoughtToolState = {
  name: string;
  input?: Record<string, unknown>;
  outputPreview?: string;
  state: ToolPart["state"];
  toolCallId?: string;
  errorText?: string;
};

function toToolPart(tool: ThoughtToolState): ToolPart {
  let output: Record<string, unknown> | undefined;
  if (tool.outputPreview) {
    try {
      const parsed = JSON.parse(tool.outputPreview) as unknown;
      output =
        typeof parsed === "object" && parsed !== null
          ? (parsed as Record<string, unknown>)
          : { result: parsed };
    } catch {
      output = { result: tool.outputPreview };
    }
  }

  return {
    type: humanizeToolName(tool.name),
    state: tool.state,
    input: tool.input,
    output,
    toolCallId: tool.toolCallId,
    errorText: tool.errorText,
  };
}

export function toolsFromReasoningJson(
  tools: ReasoningJson["tools"],
): ThoughtToolState[] {
  return tools.map((tool) => ({
    name: tool.name,
    input: tool.input,
    outputPreview: tool.outputPreview,
    toolCallId: tool.toolCallId,
    errorText: tool.isError ? tool.outputPreview : undefined,
    state: tool.isError
      ? ("output-error" as const)
      : tool.endedAt
        ? ("output-available" as const)
        : ("input-streaming" as const),
  }));
}

export function ThoughtPanel({
  thinkingText,
  tools = [],
  isStreaming,
}: {
  thinkingText?: string;
  tools?: ThoughtToolState[];
  isStreaming: boolean;
}) {
  const reasoning = (thinkingText ?? "").trim();
  const hasTools = tools.length > 0;
  if (!reasoning && !hasTools && !isStreaming) return null;

  return (
    <Reasoning isStreaming={isStreaming} className="py-1">
      <ReasoningTrigger className="gap-1 text-sm text-graphite">
        {isStreaming ? (
          <TextShimmer className="text-sm" duration={2}>
            Thinking
          </TextShimmer>
        ) : (
          <span className="text-sm text-graphite">Thought</span>
        )}
      </ReasoningTrigger>
      <ReasoningContent contentClassName="space-y-1 pt-2 text-sm text-ash">
        {reasoning ? (
          <Markdown className="prose prose-sm max-w-none text-ash dark:prose-invert">
            {reasoning}
          </Markdown>
        ) : isStreaming ? (
          <p className="text-sm text-ash">Gathering context…</p>
        ) : null}
        {tools.map((tool, index) => (
          <Tool
            key={`${tool.name}-${tool.toolCallId ?? index}`}
            toolPart={toToolPart(tool)}
            defaultOpen={tool.state === "input-streaming"}
          />
        ))}
      </ReasoningContent>
    </Reasoning>
  );
}
