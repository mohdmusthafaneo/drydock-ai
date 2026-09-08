"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { useMotionSafe } from "@/components/motion/use-motion-safe";

/** Accent border pulse — applied for a few seconds after a deep-link landing. */
export const FOCUS_BORDER_CLASS = "animate-focus-border";
/** Static accent border for prefers-reduced-motion. */
export const FOCUS_BORDER_STATIC_CLASS = "focus-border-static";

type Options = {
  /** Match `window.location.hash` (without `#`). */
  hash?: string;
  /** Match a search param value on arrival. */
  search?: { key: string; value: string };
  /** How long the highlight stays visible. */
  durationMs?: number;
  /** Scroll the target into view (default true). */
  scroll?: boolean;
  /** Move keyboard focus to the target (default true). */
  focus?: boolean;
};

/**
 * One-shot scroll + border highlight when the page is opened via a matching
 * hash and/or query param (Overview → evidence deep links).
 */
export function useDeepLinkHighlight<T extends HTMLElement = HTMLElement>(
  options: Options,
): {
  ref: RefObject<T | null>;
  highlighted: boolean;
  highlightClass: string | undefined;
} {
  const ref = useRef<T | null>(null);
  const [active, setActive] = useState(false);
  const { reduce } = useMotionSafe();
  const durationMs = options.durationMs ?? 3600;
  const shouldScroll = options.scroll !== false;
  const shouldFocus = options.focus !== false;

  useEffect(() => {
    if (typeof window === "undefined") return;

    const hashOk = options.hash
      ? window.location.hash === `#${options.hash}`
      : false;
    const searchOk = options.search
      ? new URLSearchParams(window.location.search).get(options.search.key) ===
        options.search.value
      : false;
    if (!hashOk && !searchOk) return;

    const frame = window.requestAnimationFrame(() => {
      const el = ref.current;
      if (!el) return;
      if (shouldScroll) {
        el.scrollIntoView({
          behavior: reduce ? "auto" : "smooth",
          block: "start",
        });
      }
      if (shouldFocus) {
        el.focus({ preventScroll: true });
      }
      setActive(true);
    });

    const timeout = window.setTimeout(() => setActive(false), durationMs);
    return () => {
      window.cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
    // Intentionally mount-only: highlight on arrival, not on later filter edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- deep-link snapshot on mount
  }, []);

  return {
    ref,
    highlighted: active,
    highlightClass: active
      ? reduce
        ? FOCUS_BORDER_STATIC_CLASS
        : FOCUS_BORDER_CLASS
      : undefined,
  };
}
