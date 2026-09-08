"use client";

import { useAppData } from "@/lib/store";

export function EscapesFromStore() {
  const escapes = useAppData((s) => s.data.escapes.items);

  return (
    <div className="space-y-8">
      <div>
        <p className="font-display text-[26px] tracking-[-0.23px] text-ink">
          Missed in production
        </p>
        <p className="mt-2 max-w-2xl text-[15px] leading-relaxed text-ash">
          Production bugs the suite should have caught. A production miss is a suite failure.
          Never a person&apos;s failure. Used to check whether DryDock&apos;s release advice matches reality.
        </p>
      </div>

      {escapes.length === 0 ? (
        <div className="rounded-[var(--radius-card)] border border-dove/50 bg-pure-white px-6 py-10 text-center shadow-[var(--shadow)]">
          <p className="font-display text-[22px] text-ink">No production misses on the record.</p>
          <p className="mt-2 text-[14px] text-ash">
            When a production defect lands, replay it against the suite: was there a test, was it
            green, was it skipped, did it never exist.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {escapes.map((row) => (
            <li
              key={row.id}
              className="rounded-[var(--radius-card)] border border-dove/50 bg-pure-white p-5 shadow-[var(--shadow)]"
            >
              <p className="text-[16px] font-medium text-ink">{row.title}</p>
              <p className="mt-1 text-[14px] text-ash">
                {row.status.toLowerCase()}
                {row.releaseName ? ` · ${row.releaseName}` : ""} · {row.createdAt.slice(0, 10)}
              </p>
              {row.summary ? (
                <p className="mt-2 text-[14px] text-ink">{row.summary}</p>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
