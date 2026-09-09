"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { createStore, type Store } from "@/lib/store/create-store";
import { DEFAULT_FILTERS, type AppFilters } from "@/lib/store/dimensions";
import type { AppData, AppStoreState, StoreStatus } from "@/lib/store/types";
import { seedAppData } from "@/lib/store/mock";
import { mergeAppData } from "@/lib/store/merge";
import type { DeepPartial } from "@/lib/store/deep";

export type AppDataStore = Store<AppStoreState>;

const AppDataStoreContext = createContext<AppDataStore | null>(null);

function buildInitialState(
  overlay: DeepPartial<AppData> | null | undefined,
  initialFilters: Partial<AppFilters> | undefined,
  initialStatus: StoreStatus,
): AppStoreState {
  const data = mergeAppData(seedAppData(), overlay ?? undefined);
  return {
    data,
    filters: { ...DEFAULT_FILTERS, ...initialFilters },
    status: initialStatus,
    error: null,
  };
}

export function AppDataProvider({
  children,
  overlay,
  initialFilters,
  initialStatus = "ready",
}: {
  children: ReactNode;
  /** Optional session/user fields merged onto the store seed. */
  overlay?: DeepPartial<AppData> | null;
  initialFilters?: Partial<AppFilters>;
  initialStatus?: StoreStatus;
}) {
  const storeRef = useRef<AppDataStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createStore(
      buildInitialState(overlay, initialFilters, initialStatus),
    );
  }

  return (
    <AppDataStoreContext.Provider value={storeRef.current}>
      {children}
    </AppDataStoreContext.Provider>
  );
}

function useAppStore(): AppDataStore {
  const store = useContext(AppDataStoreContext);
  if (!store) {
    throw new Error("useAppData must be used within AppDataProvider");
  }
  return store;
}

function defaultEqual<T>(a: T, b: T): boolean {
  return Object.is(a, b);
}

/**
 * Subscribe to a slice of AppStoreState via selector.
 * Snapshot cache avoids infinite loops when selectors return fresh objects
 * that are deeply equal under `isEqual`.
 */
export function useAppData<T>(
  selector: (state: AppStoreState) => T,
  isEqual: (a: T, b: T) => boolean = defaultEqual,
): T {
  const store = useAppStore();
  const selectorRef = useRef(selector);
  selectorRef.current = selector;
  const equalRef = useRef(isEqual);
  equalRef.current = isEqual;
  const cacheRef = useRef<{ snapshot: AppStoreState; selected: T } | null>(
    null,
  );

  const getSnapshot = useCallback(() => {
    const snapshot = store.get();
    const selected = selectorRef.current(snapshot);
    const cache = cacheRef.current;
    if (cache && Object.is(cache.snapshot, snapshot)) {
      return cache.selected;
    }
    if (cache && equalRef.current(cache.selected, selected)) {
      cacheRef.current = { snapshot, selected: cache.selected };
      return cache.selected;
    }
    cacheRef.current = { snapshot, selected };
    return selected;
  }, [store]);

  // SSR: same selector against current store (provider always has client state).
  const getServerSnapshot = getSnapshot;

  return useSyncExternalStore(store.subscribe, getSnapshot, getServerSnapshot);
}

export function useFilters(): AppFilters {
  return useAppData((s) => s.filters);
}

export function useSetFilter(): (
  patch: Partial<AppFilters> | ((prev: AppFilters) => AppFilters),
) => void {
  const store = useAppStore();
  return useCallback(
    (patch) => {
      store.set((prev) => ({
        ...prev,
        filters:
          typeof patch === "function"
            ? patch(prev.filters)
            : { ...prev.filters, ...patch },
      }));
    },
    [store],
  );
}

export function useStoreStatus(): StoreStatus {
  return useAppData((s) => s.status);
}

export function useSetStoreStatus(): (status: StoreStatus, error?: string | null) => void {
  const store = useAppStore();
  return useCallback(
    (status, error = null) => {
      store.set((prev) => ({ ...prev, status, error }));
    },
    [store],
  );
}

/** Replace the entire AppData (e.g. after applying a new overlay). */
export function useReplaceAppData(): (data: AppData) => void {
  const store = useAppStore();
  return useCallback(
    (data) => {
      store.set((prev) => ({ ...prev, data }));
    },
    [store],
  );
}

export function useAppDataStore(): AppDataStore {
  return useAppStore();
}

/** Shallow-compare two plain objects by keys (for filter selectors). */
export function shallowEqualRecord(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  if (Object.is(a, b)) return true;
  const aKeys = Object.keys(a);
  const bKeys = Object.keys(b);
  if (aKeys.length !== bKeys.length) return false;
  for (const key of aKeys) {
    if (!Object.is(a[key], b[key])) return false;
  }
  return true;
}

export function useAppDataMemo<T>(
  selector: (state: AppStoreState) => T,
  deps: unknown[],
): T {
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const memoized = useMemo(() => selector, deps);
  return useAppData(memoized);
}
