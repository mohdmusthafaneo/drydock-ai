/** Titles that belong on an eng/ops queue — never leadership "release approvals". */
export function isOpsQueueRecommendationTitle(title: string): boolean {
  return (
    title.startsWith("[qa-blocked:") ||
    title.startsWith("[qa-board:") ||
    title.startsWith("[cloud:")
  );
}
