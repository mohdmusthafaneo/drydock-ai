/** Deep partial for overlay merges. Arrays replace wholesale. */
export type DeepPartial<T> = {
  [K in keyof T]?: T[K] extends readonly (infer U)[]
    ? readonly U[]
    : T[K] extends object
      ? DeepPartial<T[K]>
      : T[K];
};

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.prototype.toString.call(value) === "[object Object]"
  );
}

/**
 * Deep-merge `patch` onto `base`. Arrays and non-plain objects replace.
 * Returns a new object; does not mutate inputs.
 */
export function deepMerge<T>(base: T, patch: DeepPartial<T> | undefined): T {
  if (patch === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(patch)) {
    return patch as T;
  }

  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    const prev = out[key];
    if (isPlainObject(prev) && isPlainObject(value)) {
      out[key] = deepMerge(prev, value as DeepPartial<typeof prev>);
    } else {
      out[key] = value;
    }
  }
  return out as T;
}

/** Collect dotted paths where `overlay` supplies a value (leaf or array). */
export function collectProvenancePaths(
  overlay: unknown,
  prefix = "",
): string[] {
  if (overlay === undefined || overlay === null) return [];
  if (Array.isArray(overlay) || !isPlainObject(overlay)) {
    return prefix ? [prefix] : [];
  }

  const keys = Object.keys(overlay);
  if (keys.length === 0) {
    return prefix ? [prefix] : [];
  }

  const paths: string[] = [];
  for (const key of keys) {
    const value = overlay[key];
    if (value === undefined) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (isPlainObject(value) && !Array.isArray(value)) {
      const nested = collectProvenancePaths(value, path);
      if (nested.length === 0) paths.push(path);
      else paths.push(...nested);
    } else {
      paths.push(path);
    }
  }
  return paths;
}
