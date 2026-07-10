/** Author ↔ assignee name matching (RFC §4.5). */

export function normName(s: string | null | undefined): string {
  if (!s) return "";
  return s
    .toLowerCase()
    .trim()
    .replace(/\d+/g, "")
    .replace(/[^a-z\s.\-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function nameMatchScore(
  authorName: string | null | undefined,
  email: string | null | undefined,
  assigneeName: string | null | undefined,
): number {
  const a = normName(authorName);
  const b = normName(assigneeName);
  if (!a || !b) {
    // Fall through to email-local matching when author name missing
  } else if (a === b) {
    return 1.0;
  }

  const at = a ? a.split(/[\s\-_.]+/).filter(Boolean) : [];
  const bt = b ? b.split(/[\s\-_.]+/).filter(Boolean) : [];

  if (at.length && bt.length) {
    const aSet = new Set(at);
    const overlap = bt.filter((t) => aSet.has(t));
    if (overlap.length > 0) {
      return at[0] === bt[0] ? 0.85 : 0.65;
    }

    for (const ta of at) {
      for (const tb of bt) {
        if (ta.startsWith(tb) || tb.startsWith(ta)) return 0.65;
        if (
          ta.length >= 4 &&
          tb.length >= 4 &&
          ta.slice(0, 4) === tb.slice(0, 4)
        ) {
          return 0.5;
        }
      }
    }

    const aInit = at.map((t) => t[0]).join("");
    if (aInit && (b.includes(aInit) || b.startsWith(aInit))) return 0.6;
  }

  if (email && b) {
    const local = normName(email.split("@", 1)[0] ?? "");
    if (local && (local === b || b.includes(local) || b.startsWith(local))) {
      return 0.7;
    }
  }

  return 0.0;
}
