import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  AGENT_CHAT_CONTEXT_LIMIT,
  AGENT_CHAT_OMITTED_SAMPLE_LIMIT,
  DEFAULT_THREAD_LIST_LIMIT,
  OPEN_THREAD_STATUSES,
  buildChatContextMarkdown,
  buildChatContextSections,
  buildReasoningJson,
  createAgentChatThread,
  displayMessageKind,
  formatMessageLine,
  getAgentChatThread,
  getLastHumanChatMessage,
  humanizeToolName,
  listAgentChatThreads,
  parseReasoningJson,
  partitionMessagesForContext,
  postAssistantChatMessage,
  postHumanChatMessage,
  summarizeOmittedMessages,
  truncateThreadTitle,
} from "./index";

describe("agent-chat barrel contract", () => {
  it("re-exports every value the public surface promises (4 dependents rely on these)", () => {
    // Functions must be defined and callable as functions; the barrel is the
    // only import path used by routes and pages — a missing re-export would
    // break them at build time, but only a runtime check catches re-exports
    // that resolve to `undefined` (e.g. an accidentally erased `export`).
    for (const fn of [
      createAgentChatThread,
      getAgentChatThread,
      getLastHumanChatMessage,
      listAgentChatThreads,
      postHumanChatMessage,
      postAssistantChatMessage,
      buildChatContextMarkdown,
      buildChatContextSections,
      partitionMessagesForContext,
      summarizeOmittedMessages,
      formatMessageLine,
      parseReasoningJson,
      buildReasoningJson,
      humanizeToolName,
      truncateThreadTitle,
      displayMessageKind,
    ]) {
      assert.equal(typeof fn, "function", `expected a function, got ${typeof fn}`);
    }

    for (const constant of [
      AGENT_CHAT_CONTEXT_LIMIT,
      AGENT_CHAT_OMITTED_SAMPLE_LIMIT,
      DEFAULT_THREAD_LIST_LIMIT,
      OPEN_THREAD_STATUSES,
    ]) {
      assert.notEqual(constant, undefined, "barrel constant resolved to undefined");
    }
  });

  it("exports OPEN_THREAD_STATUSES as a frozen 'open'-only list", () => {
    assert.deepEqual([...OPEN_THREAD_STATUSES], ["open"]);
  });

  it("keeps DEFAULT_THREAD_LIST_LIMIT at the documented default of 20", () => {
    assert.equal(DEFAULT_THREAD_LIST_LIMIT, 20);
  });
});

describe("displayMessageKind (re-exported from types)", () => {
  it("replaces underscores with spaces", () => {
    assert.equal(displayMessageKind("agent_reply"), "agent reply");
    assert.equal(displayMessageKind("human"), "human");
  });
});

describe("truncateThreadTitle (re-exported from types)", () => {
  it("returns the trimmed text when it fits", () => {
    assert.equal(truncateThreadTitle("  short  title  "), "short title");
  });

  it("appends an ellipsis when the text exceeds maxLen", () => {
    const out = truncateThreadTitle("a".repeat(100), 10);
    assert.equal(out.length, 10);
    assert.ok(out.endsWith("…"), `expected trailing ellipsis, got ${out}`);
  });

  it("collapses interior whitespace before measuring length", () => {
    const out = truncateThreadTitle("a   b   c", 5);
    assert.equal(out, "a b c");
  });
});

describe("parseReasoningJson / buildReasoningJson (round-trip)", () => {
  it("returns empty defaults for null/undefined/object input", () => {
    assert.deepEqual(parseReasoningJson(null), { thinking: "", tools: [] });
    assert.deepEqual(parseReasoningJson(undefined), { thinking: "", tools: [] });
    assert.deepEqual(parseReasoningJson({}), { thinking: "", tools: [] });
  });

  it("normalizes non-array tools to an empty array", () => {
    assert.deepEqual(parseReasoningJson({ tools: "nope" }), {
      thinking: "",
      tools: [],
    });
  });

  it("round-trips through buildReasoningJson", () => {
    const original = { thinking: "hmm", tools: [{ name: "search" }] };
    const json = buildReasoningJson(original);
    assert.deepEqual(parseReasoningJson(JSON.parse(json)), original);
  });
});

describe("humanizeToolName (re-exported from thought-stream)", () => {
  it("strips a leading aidos_ prefix and converts underscores to spaces", () => {
    assert.equal(humanizeToolName("aidos_delivery_dna_fetcher"), "delivery dna fetcher");
  });

  it("leaves names without the aidos_ prefix or underscores unchanged in shape", () => {
    assert.equal(humanizeToolName("jira_lookup"), "jira lookup");
    assert.equal(humanizeToolName("plain"), "plain");
  });
});
