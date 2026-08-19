/** Resolve a step key from Mastra workflow suspended path (may be nested). */
export function resolveSuspendedStepKey(
  suspended: unknown,
): string | undefined {
  if (!Array.isArray(suspended) || suspended.length === 0) return undefined;
  const first = suspended[0];
  if (typeof first === "string") return first;
  if (Array.isArray(first) && typeof first[first.length - 1] === "string") {
    return first[first.length - 1] as string;
  }
  return undefined;
}

export function readStepOutput<T>(stepResult: unknown): T | undefined {
  if (!stepResult || typeof stepResult !== "object") return undefined;
  const record = stepResult as {
    status?: string;
    output?: T;
    suspendOutput?: T;
  };
  if (record.status === "success") return record.output;
  if (record.status === "suspended") {
    return record.suspendOutput ?? record.output;
  }
  return undefined;
}
