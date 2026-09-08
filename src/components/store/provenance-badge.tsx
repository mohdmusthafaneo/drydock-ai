"use client";

import { useAppData } from "@/lib/store/hooks";

/**
 * Dev-only badge showing mock vs live provenance paths.
 * Hidden in production builds.
 */
export function ProvenanceBadge() {
  const mode = useAppData((s) => s.data.meta.mode);
  const provenance = useAppData((s) => s.data.meta.provenance);

  if (process.env.NODE_ENV === "production") return null;

  const liveCount = Object.values(provenance).filter((v) => v === "live").length;
  const label =
    mode === "mock"
      ? "mock"
      : mode === "live"
        ? "live"
        : `hybrid · ${liveCount} live`;

  return (
    <div
      className="pointer-events-none fixed bottom-3 right-3 z-[9999] rounded border border-border bg-surface px-2 py-1 font-mono text-[10px] uppercase tracking-wide text-secondary opacity-80 shadow-sm"
      title={
        liveCount > 0
          ? Object.entries(provenance)
              .filter(([, v]) => v === "live")
              .map(([k]) => k)
              .join("\n")
          : "All fields from mock AppData"
      }
    >
      data · {label}
    </div>
  );
}
