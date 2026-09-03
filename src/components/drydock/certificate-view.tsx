"use client";

import { useState } from "react";
import type { CertificateView } from "@/lib/drydock/certificate";

export function CertificateView({
  view,
}: {
  view: CertificateView;
}) {
  const [decision, setDecision] = useState<"SHIP" | "HOLD" | "ACCEPT_RISK">("HOLD");
  const [rationale, setRationale] = useState("");
  const [acceptedRisk, setAcceptedRisk] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [signed, setSigned] = useState(view.signed);

  async function sign() {
    if (!view.release) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/drydock/certificate", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          releaseId: view.release.id,
          decision,
          rationale,
          acceptedRisk,
        }),
      });
      if (!res.ok) throw new Error("Certificate did not persist");
      setSigned({
        decision,
        rationale,
        acceptedRisk,
        signedAt: new Date().toISOString(),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      <div>
        <p className="font-display text-[26px] tracking-[-0.23px] text-ink">Certificate</p>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ash">
          The signed release artifact. What was verified, what was not, what is unreliable, and
          the architect&apos;s decision. Recommend-only — this does not gate a pipeline.
        </p>
      </div>

      <p className="text-[18px] leading-relaxed text-ink">
        {view.totalTests.toLocaleString("en-US")} tests. {view.verifiedCount.toLocaleString("en-US")}{" "}
        giving real signal. {view.unverifiedCount.toLocaleString("en-US")} are not.{" "}
        {view.unreliableCount.toLocaleString("en-US")} known unreliable. {view.escapeCount}{" "}
        {view.escapeCount === 1 ? "escape" : "escapes"} on the record.
      </p>

      {view.release ? (
        <p className="text-[14px] text-ash">
          Decision unit: {view.release.name}
          {view.release.version ? ` (${view.release.version})` : ""} · {view.release.status}
        </p>
      ) : (
        <p className="text-[14px] text-ash">
          No release registered yet. Counts above are the current Ledger. Register a release to
          attach a signed decision.
        </p>
      )}

      {signed ? (
        <div className="rounded-[24px] border border-dove/50 bg-pure-white p-6 shadow-[var(--shadow)]">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-graphite">
            Signed
          </p>
          <p className="mt-2 font-display text-[22px] text-ink">{signed.decision.replace("_", " ")}</p>
          <p className="mt-2 text-[15px] text-ash">{signed.rationale}</p>
          {signed.acceptedRisk ? (
            <p className="mt-2 text-[14px] text-ink">Accepted risk: {signed.acceptedRisk}</p>
          ) : null}
          <p className="mt-3 text-[13px] text-graphite">
            {new Date(signed.signedAt).toISOString()}
          </p>
        </div>
      ) : view.release ? (
        <div className="space-y-4 rounded-[24px] border border-dove/50 bg-pure-white p-6 shadow-[var(--shadow)]">
          <label className="block text-[13px] font-medium text-ink">
            Decision
            <select
              className="mt-1 w-full rounded-xl border border-dove bg-pure-white px-3 py-2 text-[14px]"
              value={decision}
              onChange={(e) =>
                setDecision(e.target.value as "SHIP" | "HOLD" | "ACCEPT_RISK")
              }
            >
              <option value="SHIP">Ship</option>
              <option value="HOLD">Hold</option>
              <option value="ACCEPT_RISK">Accept risk</option>
            </select>
          </label>
          <label className="block text-[13px] font-medium text-ink">
            Rationale
            <textarea
              className="mt-1 w-full rounded-xl border border-dove px-3 py-2 text-[14px]"
              rows={3}
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
            />
          </label>
          <label className="block text-[13px] font-medium text-ink">
            Risk being accepted
            <textarea
              className="mt-1 w-full rounded-xl border border-dove px-3 py-2 text-[14px]"
              rows={2}
              value={acceptedRisk}
              onChange={(e) => setAcceptedRisk(e.target.value)}
            />
          </label>
          {error && <p className="text-[14px] text-rust">{error}</p>}
          <button
            type="button"
            disabled={busy || !rationale.trim()}
            onClick={() => void sign()}
            className="rounded-full bg-ink px-4 py-2 text-[14px] text-pure-white disabled:opacity-50"
          >
            Sign on the record
          </button>
        </div>
      ) : null}
    </div>
  );
}
