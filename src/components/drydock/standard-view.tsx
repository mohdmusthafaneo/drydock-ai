"use client";

import { useState } from "react";

type Pattern = {
  id: string;
  shapeLabel: string;
  plainSentence: string;
  occurrenceCount: number;
  examples: string[];
  status: "CANDIDATE" | "RATIFIED" | "REJECTED";
};

export function StandardView({ patterns }: { patterns: Pattern[] }) {
  const [rows, setRows] = useState(patterns);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, status: "RATIFIED" | "REJECTED") {
    setBusy(id);
    setError(null);
    try {
      const res = await fetch("/api/drydock/standard", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ patternId: id, status }),
      });
      if (!res.ok) throw new Error("Ruling did not persist");
      setRows((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(null);
    }
  }

  const open = rows.filter((p) => p.status === "CANDIDATE").slice(0, 2);
  const rest = rows.filter((p) => p.status !== "CANDIDATE" || !open.includes(p));

  return (
    <div className="space-y-8">
      <div>
        <p className="font-display text-[26px] tracking-[-0.23px] text-ink">The Standard</p>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ash">
          Patterns mined from the corpus. Ratify a canonical form — one or two decisions a week.
          Nothing here is grouped by who wrote the test.
        </p>
      </div>

      {error && <p className="text-[14px] text-rust">{error}</p>}

      {open.length === 0 ? (
        <div className="rounded-[24px] border border-dove/50 bg-pure-white px-6 py-10 text-center shadow-[var(--shadow)]">
          <p className="font-display text-[22px] text-ink">No ratification needed this week.</p>
          <p className="mt-2 text-[14px] text-ash">
            New drift will surface here as the corpus changes.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {open.map((p) => (
            <article
              key={p.id}
              className="rounded-[24px] border border-dove/50 bg-pure-white p-6 shadow-[var(--shadow)]"
            >
              <p className="text-[11px] font-semibold uppercase tracking-wider text-graphite">
                Ratify
              </p>
              <p className="mt-2 font-display text-[20px] text-ink">{p.shapeLabel}</p>
              <p className="mt-2 text-[15px] text-ash">{p.plainSentence}</p>
              <ul className="mt-4 list-disc space-y-1 pl-5 text-[14px] text-ink">
                {p.examples.slice(0, 5).map((ex) => (
                  <li key={ex}>{ex}</li>
                ))}
              </ul>
              <div className="mt-5 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => void decide(p.id, "RATIFIED")}
                  className="rounded-full bg-ink px-4 py-2 text-[14px] text-pure-white disabled:opacity-50"
                >
                  This form is canonical
                </button>
                <button
                  type="button"
                  disabled={busy === p.id}
                  onClick={() => void decide(p.id, "REJECTED")}
                  className="rounded-full border border-dove px-4 py-2 text-[14px] text-ink disabled:opacity-50"
                >
                  Not a convention
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {rest.length > 0 && (
        <div className="space-y-2">
          <p className="text-[13px] font-medium uppercase tracking-wider text-graphite">
            Record
          </p>
          {rest.map((p) => (
            <div key={p.id} className="rounded-xl border border-dove/40 bg-pure-white px-4 py-3">
              <p className="text-[14px] text-ink">
                {p.shapeLabel} · {p.status.toLowerCase()} · {p.occurrenceCount} tests
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
