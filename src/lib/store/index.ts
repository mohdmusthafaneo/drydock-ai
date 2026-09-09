export { createStore, type Store } from "@/lib/store/create-store";
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
} from "@/lib/store/hooks";
export { mergeAppData } from "@/lib/store/merge";
export {
  resolve,
  pick,
  DEFAULT_FILTERS,
  asDimensioned,
  teamSprintKey,
  type AppFilters,
  type Dimensioned,
  type TeamKey,
  type SprintId,
} from "@/lib/store/dimensions";
export type {
  AppData,
  AppStoreState,
  AppDataMeta,
  AppDimensions,
  AttentionQueueItem,
  OverviewData,
  OverviewLeaf,
  StoreStatus,
  OverviewDashboardModel,
  OverviewSprintOption,
} from "@/lib/store/types";
export {
  greetingForHour,
  selectOverviewModel,
  selectShellChrome,
  selectAiRiskPct,
  selectDeliveryAnalysisSnapshot,
  type ShellChrome,
} from "@/lib/store/selectors";
export { FilterUrlSync } from "@/lib/store/url-sync";
export type { DeepPartial } from "@/lib/store/deep";
// Live overlays are server-only — import from `@/lib/store/live`, not this barrel.
