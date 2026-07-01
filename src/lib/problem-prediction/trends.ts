/** Simple least-squares slope over index-ordered values (higher index = more recent). */
export function linearSlope(values: number[]): number {
  const n = values.length;
  if (n < 2) return 0;

  let sumX = 0;
  let sumY = 0;
  let sumXY = 0;
  let sumX2 = 0;

  for (let i = 0; i < n; i++) {
    sumX += i;
    sumY += values[i]!;
    sumXY += i * values[i]!;
    sumX2 += i * i;
  }

  const denom = n * sumX2 - sumX * sumX;
  if (denom === 0) return 0;
  return (n * sumXY - sumX * sumY) / denom;
}

/** Count of consecutive step-to-step worsening pairs at the tail of the series. */
export function consecutiveWorsening(
  values: number[],
  isWorse: (prev: number, curr: number) => boolean,
): number {
  if (values.length < 2) return 0;

  let streak = 0;
  for (let i = values.length - 1; i >= 1; i--) {
    if (isWorse(values[i - 1]!, values[i]!)) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

export function thresholdBreached(
  value: number,
  threshold: number,
  direction: "above" | "below",
): boolean {
  return direction === "above" ? value >= threshold : value <= threshold;
}

export function percentChange(current: number, prior: number): number {
  if (prior === 0) return current > 0 ? 100 : 0;
  return ((current - prior) / Math.abs(prior)) * 100;
}

export function recentAverage(values: number[], lastN: number): number {
  const slice = values.slice(-lastN);
  if (slice.length === 0) return 0;
  return slice.reduce((sum, v) => sum + v, 0) / slice.length;
}

export function minPointsForTrend(minPoints: number, actual: number): boolean {
  return actual >= minPoints;
}
