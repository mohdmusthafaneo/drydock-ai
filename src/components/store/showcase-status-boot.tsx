"use client";

import { useEffect, useRef } from "react";
import { useSetStoreStatus } from "@/lib/store/hooks";

/** Shared showcase skeleton delay (ms) for demo surfaces. */
export const SHOWCASE_LOAD_MS = 2000;

/**
 * Drives central `status` from loading → ready after SHOWCASE_LOAD_MS.
 * Mount once under AppDataProvider (e.g. in platform shell).
 */
export function ShowcaseStatusBoot({
  delayMs = SHOWCASE_LOAD_MS,
}: {
  delayMs?: number;
}) {
  const setStatus = useSetStoreStatus();
  const booted = useRef(false);

  useEffect(() => {
    if (booted.current) return;
    booted.current = true;
    const timer = window.setTimeout(() => setStatus("ready"), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, setStatus]);

  return null;
}
