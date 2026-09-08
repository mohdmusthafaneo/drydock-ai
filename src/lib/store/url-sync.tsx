"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useAppData, useFilters, useSetFilter } from "@/lib/store/hooks";

/**
 * Mirrors `team` and `sprint` between the AppData store and the URL so
 * `withOverviewContext()` deep links keep working across surfaces.
 */
export function FilterUrlSync() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filters = useFilters();
  const setFilter = useSetFilter();
  const ready = useAppData((s) => s.status !== "idle");

  const hydrating = useRef(true);
  const lastUrl = useRef<string>("");

  // URL → store (on mount and when the user navigates via links).
  useEffect(() => {
    const team = searchParams.get("team");
    const sprint = searchParams.get("sprint");
    const projectKey = searchParams.get("projectKey");
    const riskFocus = searchParams.get("riskFocus");

    setFilter((prev) => {
      const next = { ...prev };
      let changed = false;
      if ((team || null) !== prev.team) {
        next.team = team;
        changed = true;
      }
      if ((sprint || null) !== prev.sprint) {
        next.sprint = sprint;
        changed = true;
      }
      if ((projectKey || null) !== prev.projectKey) {
        next.projectKey = projectKey;
        changed = true;
      }
      if ((riskFocus || null) !== prev.riskFocus) {
        next.riskFocus = riskFocus;
        changed = true;
      }
      return changed ? next : prev;
    });
    hydrating.current = false;
    lastUrl.current = searchParams.toString();
    // Only re-run when the search string changes from navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Store → URL (when filters change from UI controls).
  useEffect(() => {
    if (hydrating.current || !ready) return;

    const params = new URLSearchParams(searchParams.toString());
    const setOrDelete = (key: string, value: string | null) => {
      if (value) params.set(key, value);
      else params.delete(key);
    };

    setOrDelete("team", filters.team);
    setOrDelete("sprint", filters.sprint);

    // Drop legacy fixture flag — mode lives in store meta now.
    params.delete("fixture");

    const next = params.toString();
    if (next === lastUrl.current) return;
    lastUrl.current = next;
    router.replace(next ? `${pathname}?${next}` : pathname, { scroll: false });
  }, [
    filters.team,
    filters.sprint,
    pathname,
    ready,
    router,
    searchParams,
  ]);

  return null;
}
