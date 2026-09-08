"use client";

/**
 * Public hooks for the AppData store.
 * Implementation lives in provider.tsx (needs the React context).
 */
export {
  AppDataProvider,
  useAppData,
  useFilters,
  useSetFilter,
  useStoreStatus,
  useSetStoreStatus,
  useReplaceAppData,
  useAppDataStore,
  shallowEqualRecord,
} from "@/lib/store/provider";
