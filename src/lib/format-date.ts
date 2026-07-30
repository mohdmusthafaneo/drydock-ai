export function formatDistanceToNow(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/** Fixed locale — avoids SSR/client hydration mismatches from `toLocaleString()`. */
export function formatFixedLocaleDateTime(iso: string | Date): string {
  try {
    const date = typeof iso === "string" ? new Date(iso) : iso;
    if (Number.isNaN(date.getTime())) {
      return typeof iso === "string" ? iso : "";
    }
    return date.toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return typeof iso === "string" ? iso : "";
  }
}
