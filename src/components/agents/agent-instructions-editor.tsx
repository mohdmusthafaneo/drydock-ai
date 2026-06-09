"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Label, Textarea } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

type BundleFile = {
  exists: boolean;
  content: string | null;
};

type InstructionsBundle = {
  agentId: string;
  entryFile: string;
  rootPath: string;
  files: Record<string, BundleFile>;
};

type AgentInstructionsEditorProps = {
  agentId: string;
  initialBundle: InstructionsBundle;
};

export function AgentInstructionsEditor({
  agentId,
  initialBundle,
}: AgentInstructionsEditorProps) {
  const router = useRouter();
  const fileNames = useMemo(
    () => Object.keys(initialBundle.files).sort(),
    [initialBundle.files],
  );

  const [selectedFile, setSelectedFile] = useState(
    initialBundle.entryFile || fileNames[0] || "AGENTS.md",
  );
  const [drafts, setDrafts] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    for (const [name, file] of Object.entries(initialBundle.files)) {
      initial[name] = file.content ?? "";
    }
    return initial;
  });
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const next: Record<string, string> = {};
    for (const [name, file] of Object.entries(initialBundle.files)) {
      next[name] = file.content ?? "";
    }
    setDrafts(next);
    setSelectedFile(initialBundle.entryFile || fileNames[0] || "AGENTS.md");
  }, [initialBundle, fileNames]);

  const selectedExists = initialBundle.files[selectedFile]?.exists ?? false;

  async function saveFile() {
    setLoading(true);
    setMessage(null);
    setError(null);

    const res = await fetch(`/api/agents/${agentId}/instructions`, {
      method: "PUT",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        files: { [selectedFile]: drafts[selectedFile] ?? "" },
      }),
    });

    setLoading(false);

    if (res.ok) {
      setMessage(`Saved ${selectedFile}`);
      router.refresh();
      return;
    }

    const data = (await res.json().catch(() => ({}))) as { error?: string };
    setError(data.error ?? "Save failed");
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Managed instructions</CardTitle>
        <CardDescription>
          Runtime charter loaded on every heartbeat ·{" "}
          <code className="text-xs text-slate-400">{initialBundle.rootPath}</code>
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {fileNames.map((fileName) => (
            <Button
              key={fileName}
              type="button"
              size="sm"
              variant={fileName === selectedFile ? "default" : "secondary"}
              onClick={() => setSelectedFile(fileName)}
            >
              {fileName}
              {fileName === initialBundle.entryFile && (
                <span className="ml-1 text-xs opacity-70">entry</span>
              )}
            </Button>
          ))}
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="instruction-editor">{selectedFile}</Label>
            {!selectedExists && (
              <span className="text-xs text-amber-400/90">Not materialized yet — save to create</span>
            )}
          </div>
          <Textarea
            id="instruction-editor"
            value={drafts[selectedFile] ?? ""}
            onChange={(event) =>
              setDrafts((current) => ({
                ...current,
                [selectedFile]: event.target.value,
              }))
            }
            className="min-h-[420px] font-mono text-xs leading-relaxed"
            spellCheck={false}
          />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <Button size="sm" disabled={loading} onClick={saveFile}>
            {loading ? "Saving…" : `Save ${selectedFile}`}
          </Button>
          {message && <p className="text-xs text-emerald-400">{message}</p>}
          {error && <p className="text-xs text-red-400">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
