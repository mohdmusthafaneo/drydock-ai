/** Date-window scoring with continuous falloff (RFC §4.3 / one-off script). */

export function parseEvidenceDate(
  value: string | Date | null | undefined,
): Date | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  let s = value.trim();
  if (!s) return null;
  // Jira +0530 → +05:30
  s = s.replace(/([+-])(\d{2})(\d{2})$/, "$1$2:$3");
  s = s.replace(/Z$/, "+00:00");
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function daysBetween(a: Date, b: Date): number {
  const ms = Math.abs(a.getTime() - b.getTime());
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/**
 * Returns score in [0,1] for commit date vs ticket created/resolved window.
 * Window: [created − 14d, resolved + 60d] (or created + 120d if unresolved).
 */
export function dateSignalScore(
  commitDate: string | Date | null | undefined,
  ticket: {
    createdAt?: string | Date | null;
    resolvedAt?: string | Date | null;
  },
): number {
  const cd = parseEvidenceDate(commitDate);
  const cr = parseEvidenceDate(ticket.createdAt);
  if (!cd || !cr) return 0;

  const cdN = new Date(cd.getTime());
  const crN = new Date(cr.getTime());
  const rd = parseEvidenceDate(ticket.resolvedAt);
  const rdN = rd ? new Date(rd.getTime()) : null;

  const start = new Date(crN.getTime() - 14 * 86400000);
  const end = rdN
    ? new Date(rdN.getTime() + 60 * 86400000)
    : new Date(crN.getTime() + 120 * 86400000);

  let gap = 0;
  if (cdN < start) gap = daysBetween(start, cdN);
  else if (cdN > end) gap = daysBetween(cdN, end);
  else return 1.0;

  if (gap <= 7) return 0.85;
  if (gap <= 14) return 0.65;
  if (gap <= 30) return 0.45;
  if (gap <= 60) return 0.25;
  if (gap <= 90) return 0.1;
  if (gap <= 120) return 0.03;
  return 0;
}
