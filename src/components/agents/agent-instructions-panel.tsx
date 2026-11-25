"use client";

import { useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  QueryPanelError,
  QueryPanelLoading,
} from "@/components/ui/query-panel-state";
import { agentKeys } from "@/lib/queries/keys";
import type { AgentKey } from "@/lib/agents/keys";
import { AGENT_CATALOG } from "@/lib/agents/keys";

type InstructionRow = {
  id: string;
  agentKey: AgentKey;
  title: string | null;
  content: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

async function fetchInstructions(agentKey: AgentKey): Promise<InstructionRow[]> {
  const res = await fetch(`/api/agents/${agentKey}/instructions`, {
    credentials: "same-origin",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? "Failed to load instructions");
  }
  const data = (await res.json()) as { instructions: InstructionRow[] };
  return data.instructions;
}

async function parseError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? `Request failed (${res.status})`;
}

export function AgentInstructionsPanel({
  agentKey,
  canManage,
}: {
  agentKey: AgentKey;
  canManage: boolean;
}) {
  const catalog = AGENT_CATALOG[agentKey];
  const queryClient = useQueryClient();
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editContent, setEditContent] = useState("");
  const [formError, setFormError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: agentKeys.instructions(agentKey),
    queryFn: () => fetchInstructions(agentKey),
  });

  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: agentKeys.instructions(agentKey),
    });
    await queryClient.invalidateQueries({ queryKey: agentKeys.list() });
  };

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/agents/${agentKey}/instructions`, {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim() || null,
          content: content.trim(),
          enabled: true,
        }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      return res.json();
    },
    onSuccess: async () => {
      setTitle("");
      setContent("");
      setFormError(null);
      await invalidate();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const patchMutation = useMutation({
    mutationFn: async (input: {
      id: string;
      title?: string | null;
      content?: string;
      enabled?: boolean;
    }) => {
      const res = await fetch(`/api/agents/${agentKey}/instructions/${input.id}`, {
        method: "PATCH",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          content: input.content,
          enabled: input.enabled,
        }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      return res.json();
    },
    onSuccess: async () => {
      setEditingId(null);
      setFormError(null);
      await invalidate();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/agents/${agentKey}/instructions/${id}`, {
        method: "DELETE",
        credentials: "same-origin",
      });
      if (!res.ok) throw new Error(await parseError(res));
      return res.json();
    },
    onSuccess: async () => {
      await invalidate();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const reorderMutation = useMutation({
    mutationFn: async (orderedIds: string[]) => {
      const res = await fetch(`/api/agents/${agentKey}/instructions/reorder`, {
        method: "PUT",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderedIds }),
      });
      if (!res.ok) throw new Error(await parseError(res));
      return res.json();
    },
    onSuccess: async () => {
      await invalidate();
    },
    onError: (err: Error) => setFormError(err.message),
  });

  const move = (id: string, direction: -1 | 1) => {
    if (!query.data) return;
    const ids = query.data.map((row) => row.id);
    const index = ids.indexOf(id);
    const next = index + direction;
    if (index < 0 || next < 0 || next >= ids.length) return;
    const ordered = [...ids];
    const [item] = ordered.splice(index, 1);
    ordered.splice(next, 0, item);
    reorderMutation.mutate(ordered);
  };

  if (query.isLoading) {
    return <QueryPanelLoading label="Loading instructions…" />;
  }

  if (query.isError || !query.data) {
    return (
      <QueryPanelError
        message={
          query.error instanceof Error
            ? query.error.message
            : "Failed to load instructions"
        }
        onRetry={() => void query.refetch()}
      />
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[12px] text-faint">
            <Link href="/agents" className="hover:text-accent">
              Agents
            </Link>
            <span className="mx-1.5">/</span>
            {catalog.label}
          </p>
          <h1 className="mt-1 text-[22px] font-semibold tracking-tight text-ink">
            {catalog.label}
          </h1>
          <p className="mt-1 max-w-2xl text-[13px] text-muted">
            {catalog.description}
          </p>
        </div>
      </div>

      <div className="rounded-[14px] border border-border bg-pure-white p-4 shadow-[0_2px_7px_rgba(16,24,40,0.04)]">
        <h2 className="text-[14px] font-semibold text-ink">Base prompt</h2>
        <p className="mt-1 text-[13px] text-muted">
          The agent&apos;s built-in runbook stays fixed. Org instructions below
          are appended to the system prompt at runtime — they do not replace it.
        </p>
      </div>

      <div className="rounded-[14px] border border-border bg-pure-white p-4 shadow-[0_2px_7px_rgba(16,24,40,0.04)]">
        <div className="flex items-baseline justify-between gap-3">
          <div>
            <h2 className="text-[14px] font-semibold text-ink">Instructions</h2>
            <p className="mt-1 text-[13px] text-muted">
              These lines are appended to the agent&apos;s system prompt.
            </p>
          </div>
          <p className="text-[12px] text-faint">
            {query.data.filter((r) => r.enabled).length} enabled ·{" "}
            {query.data.length} total
          </p>
        </div>

        {formError && (
          <p className="mt-3 text-[13px] text-error">{formError}</p>
        )}

        <ul className="mt-4 space-y-3">
          {query.data.length === 0 && (
            <li className="rounded-[10px] border border-dashed border-border px-3 py-6 text-center text-[13px] text-faint">
              No instructions yet.
            </li>
          )}
          {query.data.map((row, index) => (
            <li
              key={row.id}
              className="rounded-[10px] border border-border-soft bg-canvas/40 px-3 py-3"
            >
              {editingId === row.id ? (
                <div className="space-y-2">
                  <Input
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    placeholder="Optional title"
                    disabled={!canManage}
                  />
                  <Textarea
                    value={editContent}
                    onChange={(e) => setEditContent(e.target.value)}
                    rows={4}
                    disabled={!canManage}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      disabled={!canManage || !editContent.trim() || patchMutation.isPending}
                      onClick={() =>
                        patchMutation.mutate({
                          id: row.id,
                          title: editTitle.trim() || null,
                          content: editContent.trim(),
                        })
                      }
                    >
                      Save
                    </Button>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => setEditingId(null)}
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[13px] font-medium text-ink">
                        {row.title?.trim() || `Instruction ${index + 1}`}
                        {!row.enabled && (
                          <span className="ml-2 text-[11px] font-normal text-faint">
                            disabled
                          </span>
                        )}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap text-[13px] text-secondary">
                        {row.content}
                      </p>
                    </div>
                    {canManage && (
                      <div className="flex shrink-0 flex-wrap gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Move up"
                          disabled={index === 0 || reorderMutation.isPending}
                          onClick={() => move(row.id, -1)}
                        >
                          <ArrowUp className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Move down"
                          disabled={
                            index === query.data.length - 1 ||
                            reorderMutation.isPending
                          }
                          onClick={() => move(row.id, 1)}
                        >
                          <ArrowDown className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={() =>
                            patchMutation.mutate({
                              id: row.id,
                              enabled: !row.enabled,
                            })
                          }
                          disabled={patchMutation.isPending}
                        >
                          {row.enabled ? "Disable" : "Enable"}
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Edit"
                          onClick={() => {
                            setEditingId(row.id);
                            setEditTitle(row.title ?? "");
                            setEditContent(row.content);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Delete"
                          disabled={deleteMutation.isPending}
                          onClick={() => {
                            if (
                              window.confirm(
                                "Delete this instruction? This cannot be undone.",
                              )
                            ) {
                              deleteMutation.mutate(row.id);
                            }
                          }}
                        >
                          <Trash2 className="h-4 w-4 text-error" />
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>

        {canManage && (
          <form
            className="mt-5 space-y-3 border-t border-border-soft pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (!content.trim()) {
                setFormError("Content is required");
                return;
              }
              createMutation.mutate();
            }}
          >
            <h3 className="text-[13px] font-semibold text-ink">Add instruction</h3>
            <div className="space-y-1.5">
              <Label htmlFor="instruction-title">Title (optional)</Label>
              <Input
                id="instruction-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Prefer sprint board X"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="instruction-content">Content</Label>
              <Textarea
                id="instruction-content"
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={4}
                placeholder="Plain text appended to the system prompt"
                required
              />
            </div>
            <Button
              type="submit"
              size="sm"
              disabled={createMutation.isPending || !content.trim()}
            >
              {createMutation.isPending ? "Saving…" : "Add instruction"}
            </Button>
          </form>
        )}

        {!canManage && (
          <p className="mt-4 text-[12px] text-faint">
            You can view instructions. Managing them requires the agents manage
            permission.
          </p>
        )}
      </div>
    </div>
  );
}
