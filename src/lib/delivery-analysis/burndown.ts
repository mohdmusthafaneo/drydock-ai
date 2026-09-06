export type BurndownPoint = { label: string; value: number };

export type BurndownResult = {
  ideal: BurndownPoint[];
  actual: BurndownPoint[];
  completed: number;
  total: number;
};

function dayLabel(date: Date): string {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function daysBetween(start: Date, end: Date): number {
  const ms = startOfUtcDay(end).getTime() - startOfUtcDay(start).getTime();
  return Math.max(0, Math.round(ms / (24 * 60 * 60 * 1000)));
}

function addUtcDays(date: Date, days: number): Date {
  const next = startOfUtcDay(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * Ideal = linear from committed → 0 across the sprint window.
 * Actual = remaining count per day end (inferred OK when changelog is absent).
 */
export function computeBurndown(input: {
  committed: number;
  start: Date;
  end: Date;
  remainingByDay: { date: Date; remaining: number }[];
}): BurndownResult {
  const committed = Math.max(0, Math.round(input.committed));
  const start = startOfUtcDay(input.start);
  const end = startOfUtcDay(input.end);
  const span = Math.max(1, daysBetween(start, end));

  const remainingMap = new Map<string, number>();
  for (const row of input.remainingByDay) {
    const key = startOfUtcDay(row.date).toISOString();
    remainingMap.set(key, Math.max(0, Math.round(row.remaining)));
  }

  const ideal: BurndownPoint[] = [];
  const actual: BurndownPoint[] = [];
  let lastRemaining = committed;

  for (let i = 0; i <= span; i++) {
    const day = addUtcDays(start, i);
    const label = dayLabel(day);
    const idealValue = Math.round(committed * (1 - i / span));
    ideal.push({ label, value: Math.max(0, idealValue) });

    const key = day.toISOString();
    if (remainingMap.has(key)) {
      lastRemaining = remainingMap.get(key)!;
    }
    actual.push({ label, value: lastRemaining });
  }

  const finalRemaining = actual[actual.length - 1]?.value ?? committed;
  const completed = Math.max(0, committed - finalRemaining);

  return {
    ideal,
    actual,
    completed,
    total: committed,
  };
}
