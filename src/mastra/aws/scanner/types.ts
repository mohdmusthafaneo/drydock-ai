export type CollectedResource = {
  resourceType: string;
  resourceId: string;
  region?: string | null;
  name?: string | null;
  arn?: string | null;
  tags?: Record<string, string> | null;
  raw?: unknown;
};

export type CollectorContext = {
  accountId: string;
  region: string;
};

export function tagsFromAws(
  tagList?:
    | { Key?: string; Value?: string; key?: string; value?: string }[]
    | null,
): Record<string, string> | null {
  if (!tagList?.length) return null;
  const tags: Record<string, string> = {};
  for (const t of tagList) {
    const key = t.Key ?? t.key;
    if (key) tags[key] = t.Value ?? t.value ?? "";
  }
  return Object.keys(tags).length ? tags : null;
}

export function tagsFromMap(
  tagMap?: Record<string, string> | null,
): Record<string, string> | null {
  if (!tagMap || Object.keys(tagMap).length === 0) return null;
  return { ...tagMap };
}
