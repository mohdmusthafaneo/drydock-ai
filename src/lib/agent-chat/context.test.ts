import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AGENT_CHAT_CONTEXT_LIMIT,
  buildChatContextSections,
  formatMessageLine,
  partitionMessagesForContext,
  summarizeOmittedMessages,
  type ContextMessage,
} from "./context";

function msg(
  partial: Partial<ContextMessage> & Pick<ContextMessage, "kind" | "contentMarkdown">,
): ContextMessage {
  return {
    authorUser: null,
    createdAt: new Date("2026-06-01T12:00:00Z"),
    ...partial,
  };
}

describe("partitionMessagesForContext", () => {
  it("keeps only the last N messages in the recent window", () => {
    const messages = Array.from({ length: 25 }, (_, i) =>
      msg({ kind: "human", contentMarkdown: `message ${i + 1}` }),
    ).reverse();

    const { recentOldestFirst, omittedOldestFirst, totalCount } =
      partitionMessagesForContext(messages, 20);

    assert.equal(totalCount, 25);
    assert.equal(recentOldestFirst.length, 20);
    assert.equal(omittedOldestFirst.length, 5);
    assert.equal(recentOldestFirst[0]?.contentMarkdown, "message 6");
    assert.equal(recentOldestFirst[19]?.contentMarkdown, "message 25");
  });
});

describe("summarizeOmittedMessages", () => {
  it("returns a compact digest for omitted messages", () => {
    const omitted = [
      msg({ kind: "human", contentMarkdown: "How many bugs?", authorUser: { name: "Alex" } }),
      msg({
        kind: "assistant",
        contentMarkdown: "42 open bugs",
      }),
    ];

    const digest = summarizeOmittedMessages(omitted);
    assert.match(digest, /How many bugs/);
    assert.match(digest, /42 open bugs/);
  });
});

describe("buildChatContextSections", () => {
  it("includes prior contextSummary and omitted digest for long threads", () => {
    const recent = [
      msg({ kind: "human", contentMarkdown: "Latest question", authorUser: { name: "Alex" } }),
    ];

    const markdown = buildChatContextSections({
      thread: {
        id: "thread-1",
        status: "open",
        title: "Bug count",
        contextSummary: "Previously discussed release v2.1 readiness.",
      },
      recentOldestFirst: recent,
      omittedDigest: "- [human] Alex: Old question about bugs",
    });

    assert.match(markdown, /Prior context summary/);
    assert.match(markdown, /Previously discussed release v2.1 readiness/);
    assert.match(markdown, /Earlier messages \(summarized/);
    assert.match(markdown, /Old question about bugs/);
    assert.match(markdown, /Latest question/);
    assert.match(markdown, /AIDOS Assistant/);
  });

  it("includes assistant replies in context", () => {
    const recent = [
      msg({ kind: "human", contentMarkdown: "Assess release", authorUser: { name: "Alex" } }),
      msg({
        kind: "assistant",
        contentMarkdown: "Found 3 blockers",
      }),
      msg({
        kind: "assistant",
        contentMarkdown: "Governance review complete",
      }),
    ];

    const markdown = buildChatContextSections({
      thread: { id: "thread-2", status: "open", title: "Release", contextSummary: null },
      recentOldestFirst: recent,
    });

    assert.match(markdown, /Found 3 blockers/);
    assert.match(markdown, /Governance review complete/);
  });
});

describe("formatMessageLine", () => {
  it("formats assistant replies", () => {
    const line = formatMessageLine(
      msg({
        kind: "assistant",
        contentMarkdown: "All clear",
      }),
    );
    assert.match(line, /\[assistant\] Assistant/);
    assert.match(line, /All clear/);
  });
});

describe("AGENT_CHAT_CONTEXT_LIMIT", () => {
  it("defaults to 20", () => {
    assert.equal(AGENT_CHAT_CONTEXT_LIMIT, 20);
  });
});
