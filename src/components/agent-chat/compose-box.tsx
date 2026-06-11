"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import {
  invalidateThreadDetail,
  invalidateThreadList,
} from "@/lib/queries/invalidate";
import { Input, Label } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

export type MentionableAgent = {
  id: string;
  displayName: string;
};

export function ComposeBox({
  threadId,
  mentionableAgents = [],
  isDone = false,
}: {
  threadId: string;
  mentionableAgents?: MentionableAgent[];
  isDone?: boolean;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [content, setContent] = useState("");
  const [targetAgentId, setTargetAgentId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = content.trim();
    if (!trimmed) return;

    setLoading(true);
    setError(null);

    const res = await fetch(`/api/agent-threads/${threadId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        content: trimmed,
        ...(targetAgentId ? { targetAgentId } : {}),
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Failed to send message");
      return;
    }

    setContent("");
    setTargetAgentId("");
    await invalidateThreadDetail(queryClient, threadId);
    await invalidateThreadList(queryClient);
  }

  function onMentionSelect(agentId: string) {
    setTargetAgentId(agentId);
    const agent = mentionableAgents.find((a) => a.id === agentId);
    if (!agent) return;
    const mention = `@${agent.displayName} `;
    if (!content.includes(mention)) {
      setContent((prev) => (prev.trim() ? `${prev.trim()} ${mention}` : mention));
    }
  }

  return (
    <form
      onSubmit={onSubmit}
      className="border-t border-white/10 bg-[#131A2A]/50 p-4"
    >
      {isDone && (
        <p className="mb-2 text-xs text-slate-500">
          This thread is closed. Send a message to reopen and wake the Super Agent.
        </p>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex-1">
          <Label htmlFor="message" className="sr-only">
            Message
          </Label>
          <textarea
            id="message"
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              isDone
                ? "Send a message to reopen this thread…"
                : "Message the agent team…"
            }
            rows={2}
            className="w-full resize-none rounded-lg border border-white/10 bg-[#0B1020] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-brand/50 focus:outline-none"
          />
        </div>
        {mentionableAgents.length > 0 && (
          <div className="sm:w-40">
            <Label htmlFor="mention" className="sr-only">
              Mention agent
            </Label>
            <select
              id="mention"
              value={targetAgentId}
              onChange={(e) => onMentionSelect(e.target.value)}
              className="w-full rounded-lg border border-white/10 bg-[#0B1020] px-3 py-2 text-sm text-slate-100 focus:border-brand/50 focus:outline-none"
            >
              <option value="">@ Agent…</option>
              {mentionableAgents.map((agent) => (
                <option key={agent.id} value={agent.id}>
                  @{agent.displayName}
                </option>
              ))}
            </select>
          </div>
        )}
        <Button type="submit" disabled={loading || !content.trim()}>
          {loading ? "Sending…" : isDone ? "Send & reopen" : "Send"}
        </Button>
      </div>
      {targetAgentId && (
        <p className="mt-1 text-xs text-slate-500">
          Directing message to{" "}
          {mentionableAgents.find((a) => a.id === targetAgentId)?.displayName}
        </p>
      )}
      {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
    </form>
  );
}

export function CreateThreadForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);

    const form = new FormData(e.currentTarget);
    const title = (form.get("title") as string)?.trim();
    const initialMessage = (form.get("initialMessage") as string)?.trim();

    if (!initialMessage) {
      setError("First message is required");
      setLoading(false);
      return;
    }

    const res = await fetch("/api/agent-threads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({
        title: title || undefined,
        initialMessage,
      }),
    });

    const data = await res.json();
    setLoading(false);

    if (!res.ok) {
      setError(data.error || "Failed to create thread");
      return;
    }

    await invalidateThreadList(queryClient);
    router.push(`/agent-threads/${data.threadId}`);
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={onSubmit} className="space-y-4">
          <div>
            <Label htmlFor="title">Title (optional)</Label>
            <Input
              id="title"
              name="title"
              placeholder="Auto-generated from first message if empty"
            />
          </div>
          <div>
            <Label htmlFor="initialMessage">First message</Label>
            <textarea
              id="initialMessage"
              name="initialMessage"
              required
              rows={4}
              placeholder="Ask the Super Agent to coordinate specialists…"
              className="mt-1 w-full rounded-lg border border-white/10 bg-[#131A2A] px-3 py-2 text-sm"
            />
          </div>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <Button type="submit" disabled={loading} className="w-full">
            {loading ? "Creating…" : "Start thread"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
