"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  RULING_REASONS,
  verbLabel,
  type MockFinding,
} from "@/lib/drydock/mock-data";
import { Button } from "@/components/ui/button";

const VERB_STYLES: Record<MockFinding["verb"], string> = {
  rule: "bg-apricot-wash text-rust",
  route: "bg-sky-wash text-ink",
  snooze: "bg-fog text-ash border border-dove/60",
  sign_off: "bg-ink text-pure-white",
};

type Props = {
  finding: MockFinding;
  persist?: boolean;
  onRuled?: (findingId: string, reasonCode: string) => void;
};

export function FindingCard({ finding, persist = false, onRuled }: Props) {
  const [open, setOpen] = useState(false);
  const [rulingOpen, setRulingOpen] = useState(false);
  const [selectedReason, setSelectedReason] = useState<string>("");
  const [done, setDone] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (done) {
    return (
      <article className="rounded-[24px] border border-dove/40 bg-fog/80 px-5 py-4 text-[14px] text-graphite">
        Decision recorded. How widely it applies follows the reason you chose. Nothing was
        hidden without a reason — open Hidden by earlier decisions from Tests to review.
      </article>
    );
  }

  return (
    <article className="rounded-[24px] border border-dove/50 bg-pure-white p-5 shadow-[var(--shadow)] sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={cn(
            "inline-flex rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.04em]",
            VERB_STYLES[finding.verb],
          )}
        >
          {verbLabel(finding.verb)}
        </span>
        {finding.sinceLastRelease ? (
          <span className="text-[12px] text-graphite">Since last release</span>
        ) : null}
        {finding.inference ? (
          <span
            className="rounded-full border border-dove/70 px-2 py-0.5 text-[11px] text-ash"
            title="Educated guess from history, not proof"
          >
            Educated guess
          </span>
        ) : null}
        <span className="ml-auto text-[12px] text-graphite">
          ~{finding.estimatedMinutes} min
        </span>
      </div>

      <h3 className="mt-3 font-display text-[22px] leading-tight tracking-[-0.2px] text-ink">
        {finding.title}
      </h3>
      <p className="mt-2 text-[15px] leading-relaxed text-ash">{finding.plainSentence}</p>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {finding.sourceChips.map((chip) => (
          <span
            key={chip}
            className="rounded-full border border-dove/60 bg-fog px-2.5 py-0.5 text-[12px] text-graphite"
          >
            {chip === "Inference" ? "Educated guess" : chip}
          </span>
        ))}
        {finding.clusterSize > 1 ? (
          <span className="rounded-full border border-dove/60 bg-fog px-2.5 py-0.5 text-[12px] text-graphite">
            {finding.clusterSize} related
          </span>
        ) : null}
      </div>

      <div className="mt-5 flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => setRulingOpen((v) => !v)}
          className="rounded-full bg-ink px-5 text-[15px] font-medium text-pure-white hover:bg-ink/90"
        >
          {verbLabel(finding.verb)}
        </Button>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex items-center gap-1 rounded-full px-3 py-2 text-[14px] font-medium text-ink hover:bg-fog"
        >
          Evidence
          <ChevronDown
            className={cn("h-4 w-4 transition-transform", open && "rotate-180")}
            strokeWidth={1.5}
          />
        </button>
      </div>

      {rulingOpen ? (
        <div className="mt-4 space-y-3 rounded-[16px] border border-dove/50 bg-fog/70 p-4">
          <p className="text-[13px] text-ash">
            Your reason decides how widely this applies. Disagree on the record.
          </p>
          <ul className="space-y-2">
            {RULING_REASONS.map((reason) => (
              <li key={reason.code}>
                <label className="flex cursor-pointer items-start gap-3 rounded-[12px] border border-transparent px-2 py-2 hover:border-dove/50 hover:bg-pure-white">
                  <input
                    type="radio"
                    name={`ruling-${finding.id}`}
                    value={reason.code}
                    checked={selectedReason === reason.code}
                    onChange={() => setSelectedReason(reason.code)}
                    className="mt-1"
                  />
                  <span>
                    <span className="block text-[14px] font-medium text-ink">
                      {reason.label}
                    </span>
                    <span className="block text-[12px] text-graphite">
                      Applies to: {reason.scope}
                    </span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
          {error ? (
            <p className="text-[13px] text-rust">{error}</p>
          ) : null}
          <Button
            type="button"
            disabled={!selectedReason || saving}
            onClick={async () => {
              setError(null);
              if (persist) {
                setSaving(true);
                try {
                  const res = await fetch("/api/drydock/rulings", {
                    method: "POST",
                    credentials: "same-origin",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      findingId: finding.id,
                      reasonCode: selectedReason,
                    }),
                  });
                  if (!res.ok) {
                    setError("Couldn’t save your decision.");
                    return;
                  }
                } finally {
                  setSaving(false);
                }
              }
              onRuled?.(finding.id, selectedReason);
              setDone(true);
            }}
            className="rounded-full bg-ink px-5 text-[14px] text-pure-white disabled:opacity-40"
          >
            {saving ? "Saving…" : "Record decision"}
          </Button>
        </div>
      ) : null}

      {open ? (
        <div className="mt-4 space-y-3 border-t border-dove/40 pt-4 text-[13px] leading-relaxed text-ash">
          <p>
            <span className="font-medium text-ink">Repository:</span>{" "}
            {finding.evidence.repository}
          </p>
          <p>
            <span className="font-medium text-ink">File:</span>{" "}
            <code className="rounded bg-fog px-1.5 py-0.5 font-mono text-[12px] text-ink">
              {finding.evidence.filePath}
            </code>
          </p>
          <p>
            <span className="font-medium text-ink">Runs:</span>{" "}
            {finding.evidence.runSummary}
          </p>
          {finding.evidence.errorText ? (
            <pre className="overflow-x-auto rounded-[12px] bg-fog p-3 font-mono text-[12px] text-ink">
              {finding.evidence.errorText}
            </pre>
          ) : null}
          <ul className="space-y-2">
            {finding.tests.map((test) => (
              <li
                key={test.id}
                className="rounded-[12px] border border-dove/40 bg-fog/50 px-3 py-2"
              >
                <p className="font-medium text-ink">{test.name}</p>
                <p className="text-graphite">
                  {test.suitePath} · {test.executionCount} executions ·{" "}
                  {test.failCount} fails
                </p>
                <p className="mt-1">{test.evidenceSummary}</p>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}
