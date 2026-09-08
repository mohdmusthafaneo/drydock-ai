/** Local chart window options for Overview trend / heatmap cards. */

export type ChartRangeOption = {
  value: string;
  label: string;
  /** Keep the most recent N points/days from the series. */
  takeLast: number;
};

export const DELIVERY_TREND_RANGES: readonly ChartRangeOption[] = [
  { value: "3w", label: "Last 3 weeks", takeLast: 5 },
  { value: "4w", label: "Last 4 weeks", takeLast: 7 },
  /** Full mock series is authored as the 6-week window. */
  { value: "6w", label: "Last 6 weeks", takeLast: Number.POSITIVE_INFINITY },
] as const;

export const ACTIVITY_HEATMAP_RANGES: readonly ChartRangeOption[] = [
  { value: "7d", label: "Last 7 days", takeLast: 7 },
  /** Full mock series is authored as the 2-week window. */
  { value: "14d", label: "Last 2 weeks", takeLast: Number.POSITIVE_INFINITY },
] as const;

export function chartRangeFromLabel(
  label: string | undefined,
  options: readonly ChartRangeOption[],
  fallback: string,
): string {
  const match = options.find((o) => o.label === label);
  return match?.value ?? fallback;
}

export function chartRangeOption(
  value: string,
  options: readonly ChartRangeOption[],
  fallback: ChartRangeOption,
): ChartRangeOption {
  return options.find((o) => o.value === value) ?? fallback;
}

export function takeLastPoints<T>(items: T[], takeLast: number): T[] {
  if (takeLast <= 0 || items.length <= takeLast) return items;
  return items.slice(items.length - takeLast);
}
